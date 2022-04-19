import { CompletionResult, Completion, CompletionContext } from '@codemirror/autocomplete';
import { Diagnostic, setDiagnostics } from '@codemirror/lint';
import { Tooltip } from '@codemirror/tooltip';
import { PluginValue, EditorView, ViewUpdate } from '@codemirror/view';
import Client, { WebSocketTransport, RequestManager } from '@open-rpc/client-js';
import type * as LSP from 'vscode-languageserver-protocol';
import { CompletionTriggerKind, PublishDiagnosticsParams } from 'vscode-languageserver-protocol';
import { changesDelay, timeout } from './constants';
import { documentUri, languageId, rootUri, serverUri, workspaceFolders } from './facets';
import { LSPRequestMap, LSPNotifyMap, CompletionItemKindMap, Notification, TextPosition } from './types';
import { posToOffset, formatContents, prefixMatch, handlePromise, mapCodemirrorSeverity } from './util';

class LanguageServerPlugin implements PluginValue {
    private rootUri: string | null;
    private workspaceFolders: LSP.WorkspaceFolder[] | null;
    private documentUri: string;
    private languageId: string;
    private documentVersion: number;
    private transport: WebSocketTransport;
    private requestManager: RequestManager;
    private client: Client;
    private changesTimeout: number;
    private ready?: boolean;
    public capabilities?: LSP.ServerCapabilities;

    constructor(private view: EditorView) {
        this.rootUri = this.view.state.facet(rootUri);
        this.workspaceFolders = this.view.state.facet(workspaceFolders);
        this.documentUri = this.view.state.facet(documentUri);
        this.languageId = this.view.state.facet(languageId);
        this.documentVersion = 0;
        this.changesTimeout = 0;
        this.transport = new WebSocketTransport(
            this.view.state.facet(serverUri)
        );
        this.requestManager = new RequestManager([this.transport]);
        this.client = new Client(this.requestManager);
        this.client.onNotification((data) => {
            this.processNotification(data as Notification);
        });
        void this.initialize({
            documentText: this.view.state.doc.toString(),
        });
        this.transport.connection.addEventListener('message', (message: any) => {
            const data = JSON.parse(message.data as string);
            if (data.method && data.id) {
                handlePromise(this.processRequest(data));
            }
        });
    }

    update({ docChanged }: ViewUpdate): void {
        if (!docChanged) return;
        if (this.changesTimeout) clearTimeout(this.changesTimeout);
        this.changesTimeout = self.setTimeout(() => {
            void this.sendChange({
                documentText: this.view.state.doc.toString(),
            });
        }, changesDelay);
    }

    destroy(): void {
        this.client.close();
    }

    private request<K extends keyof LSPRequestMap>(method: K, params: LSPRequestMap[K][0], timeout: number): Promise<LSPRequestMap[K][1]> {
        return this.client.request({ method, params }, timeout);
    }

    private notify<K extends keyof LSPNotifyMap>(method: K, params: LSPNotifyMap[K]): Promise<LSPNotifyMap[K]> {
        return this.client.notify({ method, params });
    }

    async initialize({ documentText }: { documentText: string }): Promise<void> {
        const { capabilities } = await this.request('initialize', {
            capabilities: {
                textDocument: {
                    hover: {
                        dynamicRegistration: true,
                        contentFormat: ['plaintext', 'markdown'],
                    },
                    moniker: {},
                    synchronization: {
                        dynamicRegistration: true,
                        willSave: false,
                        didSave: false,
                        willSaveWaitUntil: false,
                    },
                    completion: {
                        dynamicRegistration: true,
                        completionItem: {
                            snippetSupport: false,
                            commitCharactersSupport: true,
                            documentationFormat: ['plaintext', 'markdown'],
                            deprecatedSupport: false,
                            preselectSupport: false,
                        },
                        contextSupport: false,
                    },
                    signatureHelp: {
                        dynamicRegistration: true,
                        signatureInformation: {
                            documentationFormat: ['plaintext', 'markdown'],
                        },
                    },
                    declaration: {
                        dynamicRegistration: true,
                        linkSupport: true,
                    },
                    definition: {
                        dynamicRegistration: true,
                        linkSupport: true,
                    },
                    typeDefinition: {
                        dynamicRegistration: true,
                        linkSupport: true,
                    },
                    implementation: {
                        dynamicRegistration: true,
                        linkSupport: true,
                    },
                },
                workspace: {
                    didChangeConfiguration: {
                        dynamicRegistration: true,
                    },
                },
            },
            initializationOptions: null,
            processId: null,
            rootUri: this.rootUri,
            workspaceFolders: this.workspaceFolders,
        }, timeout * 3);
        this.capabilities = capabilities;
        await this.notify('initialized', {});
        await this.notify('textDocument/didOpen', {
            textDocument: {
                uri: this.documentUri,
                languageId: this.languageId,
                text: documentText,
                version: this.documentVersion,
            },
        });
        this.ready = true;
    }

    async sendChange({ documentText }: { documentText: string }): Promise<void> {
        if (!this.ready) return;
        try {
            await this.notify('textDocument/didChange', {
                textDocument: {
                    uri: this.documentUri,
                    version: this.documentVersion++,
                },
                contentChanges: [{ text: documentText }],
            });
        } catch (e) {
            console.error(e);
        }
    }

    async requestDiagnostics(view: EditorView): Promise<void> {
        await this.sendChange({ documentText: view.state.doc.toString() });
    }

    async requestHoverTooltip(
        view: EditorView,
        { line, character }: TextPosition
    ): Promise<Tooltip | null> {
        if (!this.ready || !this.capabilities?.hoverProvider) return null;

        await this.sendChange({ documentText: view.state.doc.toString() });
        const result = await this.request('textDocument/hover', {
            textDocument: { uri: this.documentUri },
            position: { line, character },
        }, timeout);
        if (!result) return null;
        const { contents, range } = result;
        let pos = posToOffset(view.state.doc, { line, character });
        let end: number | undefined;
        if (range) {
            pos = posToOffset(view.state.doc, range.start);
            end = posToOffset(view.state.doc, range.end);
        }
        if (pos === null) return null;
        const dom = document.createElement('div');
        dom.classList.add('documentation');
        dom.textContent = formatContents(contents);
        return { pos, end, create: () => ({ dom }), above: true };
    }

    async requestCompletion(
        context: CompletionContext,
        { line, character }: TextPosition,
        {
            triggerKind,
            triggerCharacter,
        }: {
            triggerKind: CompletionTriggerKind;
            triggerCharacter: string | undefined;
        }
    ): Promise<CompletionResult | null> {
        if (!this.ready || !this.capabilities?.completionProvider) return null;
        await this.sendChange({
            documentText: context.state.doc.toString(),
        });

        const result = await this.request('textDocument/completion', {
            textDocument: { uri: this.documentUri },
            position: { line, character },
            context: {
                triggerKind,
                triggerCharacter,
            },
        }, timeout);

        if (!result) return null;

        const items = 'items' in result ? result.items : result;

        let options = items.map(
            ({
                detail,
                label,
                kind,
                textEdit,
                documentation,
                sortText,
                filterText,
            }) => {
                const completion: Completion & {
                    filterText: string;
                    sortText?: string;
                    apply: string;
                } = {
                    label,
                    detail,
                    apply: textEdit?.newText ?? label,
                    type: kind && CompletionItemKindMap[kind].toLowerCase(),
                    sortText: sortText ?? label,
                    filterText: filterText ?? label,
                };
                if (documentation) {
                    completion.info = formatContents(documentation);
                }
                return completion;
            }
        );

        const [, match] = prefixMatch(options);
        const token = context.matchBefore(match);
        let { pos } = context;

        if (token) {
            pos = token.from;
            const word = token.text.toLowerCase();
            if (/^\w+$/.test(word)) {
                options = options
                    .filter(({ filterText }) =>
                        filterText.toLowerCase().startsWith(word)
                    )
                    .sort(({ apply: a }, { apply: b }) => {
                        switch (true) {
                            case a.startsWith(token.text) &&
                                !b.startsWith(token.text):
                                return -1;
                            case !a.startsWith(token.text) &&
                                b.startsWith(token.text):
                                return 1;
                        }
                        return 0;
                    });
            }
        }
        return {
            from: pos,
            options,
        };
    }

    async processRequest({ id }: { id: string }): Promise<void> {
        await this.transport.connection.send(JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: null
        }));
    }

    processNotification(notification: Notification): void {
        try {
            switch (notification.method) {
                case 'textDocument/publishDiagnostics':
                    this.processDiagnostics(notification.params);
                    break;
            }
        } catch (error) {
            console.error(error);
        }
    }

    processDiagnostics(params: PublishDiagnosticsParams): void {
        const diagnostics = params.diagnostics
            .map<Diagnostic>(({ range, message, severity }) => ({
                from: posToOffset(this.view.state.doc, range.start),
                to: posToOffset(this.view.state.doc, range.end),
                severity: mapCodemirrorSeverity(severity),
                message,
            }))
            .filter(({ from, to }) => from !== null && to !== null && from !== undefined && to !== undefined)
            .sort((a, b) => {
                switch (true) {
                    case a.from < b.from:
                        return -1;
                    case a.from > b.from:
                        return 1;
                }
                return 0;
            });

        this.view.dispatch(setDiagnostics(this.view.state, diagnostics));
    }
}
