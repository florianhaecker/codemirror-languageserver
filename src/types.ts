import type * as LSP from 'vscode-languageserver-protocol';
import { CompletionItemKind } from 'vscode-languageserver-protocol';

export type TextPosition = {
    line: number;
    character: number;
}

export const CompletionItemKindMap = Object.fromEntries(
    Object.entries(CompletionItemKind).map(([key, value]) => [value, key])
) as Record<CompletionItemKind, string>;

// https://microsoft.github.io/language-server-protocol/specifications/specification-current/

// Client to server then server to client
export interface LSPRequestMap {
    initialize: [LSP.InitializeParams, LSP.InitializeResult];
    'textDocument/hover': [LSP.HoverParams, LSP.Hover];
    'textDocument/completion': [
        LSP.CompletionParams,
        LSP.CompletionItem[] | LSP.CompletionList | null
    ];
}

// Client to server
export interface LSPNotifyMap {
    initialized: LSP.InitializedParams;
    'textDocument/didChange': LSP.DidChangeTextDocumentParams;
    'textDocument/didOpen': LSP.DidOpenTextDocumentParams;
}

// Server to client
export interface LSPEventMap {
    'textDocument/publishDiagnostics': LSP.PublishDiagnosticsParams;
}

export type Notification = {
    [key in keyof LSPEventMap]: {
        jsonrpc: '2.0';
        id?: null | undefined;
        method: key;
        params: LSPEventMap[key];
    };
}[keyof LSPEventMap];


export interface LanguageServerOptions {
    serverUri: `ws://${string}` | `wss://${string}`;
    rootUri: string | null;
    workspaceFolders: LSP.WorkspaceFolder[] | null;
    documentUri: string;
    languageId: string;
}