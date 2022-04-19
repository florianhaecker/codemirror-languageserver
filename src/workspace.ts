import { timeout } from "./constants";
import type * as LSP from 'vscode-languageserver-protocol';
import { LSPClient } from "./lsp-client";
import { LSPNotificationMap, Notification } from "./types";
import { handlePromise } from "./util";

export interface WorkspaceParams {
    serverUri: string;
    rootUri: string;
    workspaceFolders: LSP.WorkspaceFolder[] | null;
}

export interface LspFile {
    uri: string;

    close: () => void;
}

export type NotificationHandler<T> = (params: T) => void;

type FileNotificationHandlers = {
    [key in keyof LSPNotificationMap]?: NotificationHandler<LSPNotificationMap[key]>;
}

type OpenFile = {
    notification: FileNotificationHandlers;
}

/**
 * Multiple open files with same uri is not allowed, since changes in both files need to be synced
 */
type OpenFiles = {
    [uri: string]: OpenFile;
}

export class Workspace {
    static async create(params: WorkspaceParams): Promise<Workspace> {
        const lspClient = new LSPClient(params.serverUri);
        
        const initializeResult = await lspClient.request('initialize', {
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
            rootUri: params.rootUri,
            workspaceFolders: params.workspaceFolders,
        }, timeout * 3);
        
        await lspClient.notify('initialized', {});
        
        return new Workspace(lspClient, initializeResult.capabilities);
    }

    private openFiles: OpenFiles = {};
    
    private constructor(public readonly lspClient: LSPClient, public readonly capabilities: LSP.ServerCapabilities) {
        lspClient.notificationHandler = (notification): void => {
            this.processNotification(notification);
        }
    }

    private processNotification(notification: Notification): void {
        try {
            const notificationUri = notification.params.uri;

            if(this.openFiles[notificationUri]) {
                this.openFiles[notificationUri].notification[notification.method]?.(notification.params);
            }
        } catch (error) {
            console.error(error);
        }
    }

    async openFile(params: {
        uri: string;
        languageId: string;
        text: string;
        notificationHandlers: FileNotificationHandlers;
    }): Promise<LspFile> {
        if(this.openFiles[params.uri]) {
            throw new Error("already open");
        }
        
        const documentVersion = 0;
        const openFile: OpenFile = {
            notification: params.notificationHandlers,
        }
        
        await this.lspClient.notify('textDocument/didOpen', {
            textDocument: {
                uri: params.uri,
                languageId: params.languageId,
                text: params.text,
                version: documentVersion,
            },
        });
        
        this.openFiles[params.uri] = openFile;

        return {
            uri: params.uri,
            close: (): void => {
                if(this.openFiles[params.uri]) {
                    delete this.openFiles[params.uri]

                    handlePromise(this.lspClient.notify('textDocument/didClose', {
                        textDocument: {
                            uri: params.uri,
                        },
                    }));
                }
            }
        }
    }

    destroy(): void {
        this.lspClient.destroy();
    }
}
