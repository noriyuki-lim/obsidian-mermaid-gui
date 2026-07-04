import { useCallback, useMemo, useState } from "react";
import { parseArchitecture } from "../../core/architecture/parser";
import { generateArchitecture } from "../../core/architecture/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import type {
  ArchitectureIR, ArchItem, ArchGroup, ArchService, ArchEdge, ArchEdgeDirection, ArchArrow,
} from "../../core/architecture/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

// Common built-in icons (Mermaid built-in set). Users can type any string too.
const BUILTIN_ICONS = ["cloud", "database", "disk", "internet", "server"];
const ARROWS: ArchArrow[] = ["--", "-->", "<--", "<-->"];
const DIRECTIONS: ArchEdgeDirection[] = ["T", "B", "L", "R"];

function seed(source: string): ArchitectureIR {
  const out = parseArchitecture(source);
  if (out.ok) return out.ir;
  return { kind: "architecture-beta", items: [] };
}

export const ArchitectureEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const [ir, setIr] = useState<ArchitectureIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);

  const currentSource = useMemo(() => generateArchitecture(ir), [ir]);

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const out = parseArchitecture(next);
    if (!out.ok) return { ok: false, error: out.message };
    setIr(out.ir);
    return { ok: true };
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try { await onSave(currentSource); } finally { setSaving(false); }
  }, [saving, currentSource, onSave]);

  const groups = ir.items.filter((it): it is ArchGroup => it.type === "group");
  const services = ir.items.filter((it): it is ArchService => it.type === "service");
  const edges = ir.items.filter((it): it is ArchEdge => it.type === "edge");
  const others = ir.items.filter((it) => it.type !== "group" && it.type !== "service" && it.type !== "edge");

  const setAll = (g: ArchGroup[], s: ArchService[], e: ArchEdge[]) => {
    setIr({ kind: "architecture-beta", items: [...g, ...s, ...e, ...others] });
  };

  // groups
  const addGroup = () => {
    setAll([...groups, { type: "group", id: `g${groups.length + 1}`, icon: "cloud", label: `Group ${groups.length + 1}` }], services, edges);
  };
  const updateGroup = (i: number, patch: Partial<ArchGroup>) =>
    setAll(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)), services, edges);
  const removeGroup = (i: number) =>
    setAll(groups.filter((_, j) => j !== i), services, edges);

  // services
  const addService = () => {
    setAll(groups, [...services, { type: "service", id: `s${services.length + 1}`, icon: "server", label: `Service ${services.length + 1}` }], edges);
  };
  const updateService = (i: number, patch: Partial<ArchService>) =>
    setAll(groups, services.map((s, j) => (j === i ? { ...s, ...patch } : s)), edges);
  const removeService = (i: number) =>
    setAll(groups, services.filter((_, j) => j !== i), edges);

  // edges
  const addEdge = () => {
    const a = services[0]?.id ?? "a";
    const b = services[1]?.id ?? "b";
    setAll(groups, services, [...edges, { type: "edge", fromId: a, fromDir: "R", arrow: "--", toDir: "L", toId: b }]);
  };
  const updateEdge = (i: number, patch: Partial<ArchEdge>) =>
    setAll(groups, services, edges.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const removeEdge = (i: number) =>
    setAll(groups, services, edges.filter((_, j) => j !== i));

  return (
    <EditorShell
      diagramKind="architecture-beta"
      currentSource={currentSource}
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      renderMermaid={renderMermaid}
      onSourceEdit={handleSourceEdit}
    >
      <div className="mge-seq-body">
        {/* Groups */}
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Groups</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addGroup}>+ group</button>
            </div>
          </div>
          {groups.length === 0 && <p className="mge-seq-empty">グループ未定義。</p>}
          {groups.map((g, i) => (
            <div key={i} className="mge-seq-row">
              <span className="mge-seq-badge">group</span>
              <input className="mge-seq-input" value={g.id} onChange={(e) => updateGroup(i, { id: e.target.value })} placeholder="id" style={{ width: 90 }} />
              <input className="mge-seq-input" value={g.icon ?? ""} onChange={(e) => updateGroup(i, { icon: e.target.value || undefined })} placeholder="icon" list="mge-arch-icons" style={{ width: 100 }} />
              <input className="mge-seq-input mge-seq-input-wide" value={g.label ?? ""} onChange={(e) => updateGroup(i, { label: e.target.value || undefined })} placeholder="label" />
              <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => removeGroup(i)}>×</button>
            </div>
          ))}
        </section>

        {/* Services */}
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Services</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addService}>+ service</button>
            </div>
          </div>
          {services.length === 0 && <p className="mge-seq-empty">サービス未定義。</p>}
          {services.map((s, i) => (
            <div key={i} className="mge-seq-row">
              <span className="mge-seq-badge">service</span>
              <input className="mge-seq-input" value={s.id} onChange={(e) => updateService(i, { id: e.target.value })} placeholder="id" style={{ width: 90 }} />
              <input className="mge-seq-input" value={s.icon ?? ""} onChange={(e) => updateService(i, { icon: e.target.value || undefined })} placeholder="icon" list="mge-arch-icons" style={{ width: 100 }} />
              <input className="mge-seq-input mge-seq-input-wide" value={s.label ?? ""} onChange={(e) => updateService(i, { label: e.target.value || undefined })} placeholder="label" />
              <select className="mge-seq-select" value={s.group ?? ""} onChange={(e) => updateService(i, { group: e.target.value || undefined })}>
                <option value="">(no group)</option>
                {groups.map((g) => <option key={g.id} value={g.id}>in {g.id}</option>)}
              </select>
              <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => removeService(i)}>×</button>
            </div>
          ))}
        </section>

        {/* Edges */}
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Edges</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addEdge}>+ edge</button>
            </div>
          </div>
          {edges.length === 0 && <p className="mge-seq-empty">エッジ未定義。</p>}
          {edges.map((e, i) => (
            <div key={i} className="mge-seq-row">
              <span className="mge-seq-badge">edge</span>
              <input className="mge-seq-input" value={e.fromId} onChange={(ev) => updateEdge(i, { fromId: ev.target.value })} placeholder="from" style={{ width: 80 }} />
              <select className="mge-seq-select" value={e.fromDir} onChange={(ev) => updateEdge(i, { fromDir: ev.target.value as ArchEdgeDirection })}>
                {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select className="mge-seq-select" value={e.arrow} onChange={(ev) => updateEdge(i, { arrow: ev.target.value as ArchArrow })}>
                {ARROWS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className="mge-seq-select" value={e.toDir} onChange={(ev) => updateEdge(i, { toDir: ev.target.value as ArchEdgeDirection })}>
                {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <input className="mge-seq-input" value={e.toId} onChange={(ev) => updateEdge(i, { toId: ev.target.value })} placeholder="to" style={{ width: 80 }} />
              <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => removeEdge(i)}>×</button>
            </div>
          ))}
        </section>

        {others.length > 0 && (
          <section className="mge-seq-section">
            <div className="mge-seq-section-header">
              <span className="mge-seq-section-title">Other (raw / junction)</span>
            </div>
            {others.map((item, i) => (
              <div key={i} className="mge-seq-row mge-seq-row-raw">
                <span className="mge-seq-badge mge-seq-badge-raw">{item.type}</span>
                <code className="mge-seq-raw-line">
                  {item.type === "raw" ? item.line.trim() : `junction ${(item as { id: string }).id}`}
                </code>
              </div>
            ))}
          </section>
        )}

        <datalist id="mge-arch-icons">
          {BUILTIN_ICONS.map((n) => <option key={n} value={n} />)}
        </datalist>
      </div>
    </EditorShell>
  );
};
