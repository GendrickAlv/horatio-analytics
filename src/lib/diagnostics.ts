export interface RowDiagnostic {
  row: number;
  field?: string;
  value?: unknown;
  error: string;
}

export interface DiagnosticsReport {
  diagnostics: RowDiagnostic[];
  truncated: boolean;
}

export class DiagnosticsCollector {
  private readonly entries: RowDiagnostic[] = [];
  private overflow = false;

  constructor(private readonly limit = 1000) {}

  add(entry: RowDiagnostic): void {
    if (this.entries.length < this.limit) {
      this.entries.push(entry);
      return;
    }
    this.overflow = true;
  }

  addMany(entries: readonly RowDiagnostic[]): void {
    for (const entry of entries) this.add(entry);
  }

  get size(): number {
    return this.entries.length;
  }

  report(): DiagnosticsReport {
    return { diagnostics: [...this.entries], truncated: this.overflow };
  }
}
