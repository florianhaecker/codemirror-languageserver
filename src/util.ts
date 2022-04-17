import type { Completion } from '@codemirror/autocomplete';
import { Diagnostic } from '@codemirror/lint';
import type { Text } from '@codemirror/state';
import type * as LSP from 'vscode-languageserver-protocol';
import { DiagnosticSeverity } from 'vscode-languageserver-protocol';
import { TextPosition } from './types';

export function posToOffset(doc: Text, pos: { line: number; character: number }): number {
    if (pos.line >= doc.lines) {
        throw new Error("position line is outside of document");
    }

    const offset = doc.line(pos.line + 1).from + pos.character;
    
    if (offset > doc.length) {
        throw new Error("offset is greater than document length");
    }

    return offset;
}

export function offsetToPos(doc: Text, offset: number): TextPosition {
    const line = doc.lineAt(offset);
    return {
        line: line.number - 1,
        character: offset - line.from,
    };
}

export function handlePromise(p: Promise<unknown>): void {
    p.catch(reason => console.error(reason));
}

export function formatContents(
    contents: LSP.MarkupContent | LSP.MarkedString | LSP.MarkedString[]
): string {
    if (Array.isArray(contents)) {
        return contents.map((c) => formatContents(c) + '\n\n').join('');
    } else if (typeof contents === 'string') {
        return contents;
    } else {
        return contents.value;
    }
}

export function prefixMatch(options: Completion[]): RegExp[] {
    const first = new Set<string>();
    const rest = new Set<string>();

    for (const { apply } of options) {
        const [initial, ...restStr] = apply as string;
        first.add(initial);
        for (const char of restStr) {
            rest.add(char);
        }
    }

    const source = toSet(first) + toSet(rest) + '*$';
    return [new RegExp('^' + source), new RegExp(source)];
}

export function toSet(chars: Set<string>): string {
    let preamble = '';
    let flat = Array.from(chars).join('');
    const words = /\w/.test(flat);
    if (words) {
        preamble += '\\w';
        flat = flat.replace(/\w/g, '');
    }
    return `[${preamble}${flat.replace(/[^\w\s]/g, '\\$&')}]`;
}

export function mapCodemirrorSeverity(severity: DiagnosticSeverity | undefined): Diagnostic["severity"] {
    switch (severity) {
    case DiagnosticSeverity.Error:
        return "error";

    case DiagnosticSeverity.Warning:
        return "warning";
        
    case DiagnosticSeverity.Hint:
    case DiagnosticSeverity.Information:
    default:
        return "info";
    }
}