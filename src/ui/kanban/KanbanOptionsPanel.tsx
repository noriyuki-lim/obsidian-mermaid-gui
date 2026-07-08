import type { KanbanCardFields } from "../../core/kanban/meta";
import { useT } from "../EditorHostContext";
import { KANBAN_PRIORITIES, PRIORITY_LABEL_KEY } from "./priority";

interface Props {
  ticketBaseUrl: string;
  onTicketBaseUrlChange: (value: string) => void;
  selectedCardFields: KanbanCardFields | null;
  onCardFieldChange: (field: keyof KanbanCardFields, value: string) => void;
}

/**
 * Right-side "advanced options" panel for the kanban editor: board-level
 * `ticketBaseUrl` (Mermaid frontmatter config) and the selected card's
 * ticket / assignee / priority metadata. Mermaid's kanban diagram has no
 * arbitrary color config for columns or cards — priority is the only thing
 * that visibly colors a card, so that's the "color" control this exposes.
 */
export const KanbanOptionsPanel = ({
  ticketBaseUrl,
  onTicketBaseUrlChange,
  selectedCardFields,
  onCardFieldChange,
}: Props) => {
  const t = useT();
  return (
    <aside className="mge-kanban-options">
      <h4>{t.kanban.optionsTitle}</h4>
      <div className="mge-kanban-options-field">
        <label htmlFor="mge-kanban-ticket-base-url">{t.kanban.ticketBaseUrlLabel}</label>
        <input
          id="mge-kanban-ticket-base-url"
          type="text"
          value={ticketBaseUrl}
          placeholder={t.kanban.ticketBaseUrlPlaceholder}
          onChange={(e) => onTicketBaseUrlChange(e.target.value)}
        />
      </div>

      <h4>{t.kanban.selectedCardTitle}</h4>
      {selectedCardFields ? (
        <>
          <div className="mge-kanban-options-field">
            <label htmlFor="mge-kanban-card-ticket">{t.kanban.ticketLabel}</label>
            <input
              id="mge-kanban-card-ticket"
              type="text"
              value={selectedCardFields.ticket ?? ""}
              placeholder={t.kanban.ticketPlaceholder}
              onChange={(e) => onCardFieldChange("ticket", e.target.value)}
            />
          </div>
          <div className="mge-kanban-options-field">
            <label htmlFor="mge-kanban-card-assigned">{t.kanban.assignedLabel}</label>
            <input
              id="mge-kanban-card-assigned"
              type="text"
              value={selectedCardFields.assigned ?? ""}
              placeholder={t.kanban.assignedPlaceholder}
              onChange={(e) => onCardFieldChange("assigned", e.target.value)}
            />
          </div>
          <div className="mge-kanban-options-field">
            <label htmlFor="mge-kanban-card-priority">{t.kanban.priorityLabel}</label>
            <select
              id="mge-kanban-card-priority"
              value={selectedCardFields.priority ?? ""}
              onChange={(e) => onCardFieldChange("priority", e.target.value)}
            >
              <option value="">{t.kanban.priorityNone}</option>
              {KANBAN_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t.kanban[PRIORITY_LABEL_KEY[p]]}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <p className="mge-kanban-options-empty">{t.kanban.selectedCardEmptyHint}</p>
      )}
    </aside>
  );
};
