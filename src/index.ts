import { autocompletion, CompletionResult } from '@codemirror/autocomplete';
import { Extension } from '@codemirror/state';
import { hoverTooltip } from '@codemirror/tooltip';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { CompletionTriggerKind } from 'vscode-languageserver-protocol';
import { serverUri, workspaceFolders, rootUri, documentUri, languageId } from './facets';
import { LanguageServerPlugin } from './language-server-plugin';
import { LanguageServerOptions } from './types';
import { offsetToPos } from './util';


export function languageServer(options: LanguageServerOptions): Extension[] {
    let plugin: LanguageServerPlugin | null = null;

    return [
        serverUri.of(options.serverUri),
        workspaceFolders.of(options.workspaceFolders),
        rootUri.of(options.rootUri),
        documentUri.of(options.documentUri),
        languageId.of(options.languageId),
        ViewPlugin.define((view) => (plugin = new LanguageServerPlugin(view))),
        hoverTooltip((view, pos) => {
            return plugin?.requestHoverTooltip(view, offsetToPos(view.state.doc, pos)) ?? null
        }),
        autocompletion({
            override: [
                async (context): Promise<CompletionResult | null> => {
                    if (plugin == null) return null;

                    const { state, pos, explicit } = context;
                    const line = state.doc.lineAt(pos);
                    let trigKind: CompletionTriggerKind =
                        CompletionTriggerKind.Invoked;
                    let trigChar: string | undefined;
                    if (
                        !explicit &&
                        plugin.capabilities?.completionProvider?.triggerCharacters?.includes(
                            line.text[pos - line.from - 1]
                        )
                    ) {
                        trigKind = CompletionTriggerKind.TriggerCharacter;
                        trigChar = line.text[pos - line.from - 1];
                    }
                    if (
                        trigKind === CompletionTriggerKind.Invoked &&
                        !context.matchBefore(/\w+$/)
                    ) {
                        return null;
                    }
                    return await plugin.requestCompletion(
                        context,
                        offsetToPos(state.doc, pos),
                        {
                            triggerKind: trigKind,
                            triggerCharacter: trigChar,
                        }
                    );
                },
            ],
        }),
        baseTheme,
    ];
}

const baseTheme = EditorView.baseTheme({
    '.cm-tooltip.documentation': {
        display: 'block',
        marginLeft: '0',
        padding: '3px 6px 3px 8px',
        borderLeft: '5px solid #999',
        whiteSpace: 'pre',
    },
    '.cm-tooltip.lint': {
        whiteSpace: 'pre',
    },
});
