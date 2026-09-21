import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { ScaleExplorerMessages } from "../lib/i18n/messages/types";
import {
  SCALE_EXPLORER_DEFINITION,
  SCALE_EXPLORER_SOURCES,
  buildScaleExplorerModel,
  type ScaleExplorerNode,
  type ScaleExplorerState,
} from "../lib/simulations/scale-explorer";

type ScaleExplorerNoScriptProps = Readonly<{
  initialState: ScaleExplorerState;
  initialStateInvalid: boolean;
  locale: PublishedLocale;
  messages: ScaleExplorerMessages;
}>;

function quantityLabel(
  quantity: ScaleExplorerNode["characteristic_quantity"],
  messages: ScaleExplorerMessages["quantities"],
): string {
  switch (quantity) {
    case "diameter":
      return messages.diameter;
    case "width":
      return messages.width;
    case "observable-extent":
      return messages.observableExtent;
  }
}

function sourceQuantityLabel(
  quantity: ScaleExplorerNode["source_quantity"],
  messages: ScaleExplorerMessages["sourceQuantities"],
): string {
  return messages[quantity];
}

function statusLabel(
  status: ScaleExplorerNode["value_status"],
  messages: ScaleExplorerMessages["statuses"],
): string {
  switch (status) {
    case "approximate":
      return messages.approximate;
    case "derived-approximate":
      return messages.derivedApproximate;
    case "model-based":
      return messages.modelBased;
    case "reported":
      return messages.reported;
  }
}

function formatDisplayPosition(positionPercent: number, locale: PublishedLocale): string {
  return `${formatLocaleFixedNumber(positionPercent, 1, locale)}%`;
}

function sourceForId(id: string) {
  return SCALE_EXPLORER_SOURCES.find((source) => source.id === id);
}

function SourceReferences({
  messages,
  sourceIds,
}: Readonly<{
  messages: ScaleExplorerMessages["sources"];
  sourceIds: ReadonlyArray<string>;
}>) {
  return (
    <ul>
      {sourceIds.map((sourceId) => {
        const source = sourceForId(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>{formatMessageTemplate(messages.unavailableReference, { sourceId })}</>
            ) : (
              <>
                <a href={source.url} rel="noreferrer">
                  {source.title}
                </a>{" "}
                ({source.organization_or_authors}; {source.id})
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Server-rendered, no-JavaScript representation of the same reviewed state.
 *
 * The no-script element is intentionally a semantic HTML alternative rather than an aria label
 * on the visual track. Scientific conversion and derived values remain owned by the Python
 * model/artifact boundary; this component only presents checked-in artifact values.
 */
export function ScaleExplorerNoScript({
  initialState,
  initialStateInvalid,
  locale,
  messages,
}: ScaleExplorerNoScriptProps) {
  const model = buildScaleExplorerModel(initialState);
  const selected = model.selected.node;

  return (
    <noscript>
      <article>
        <header>
          <p>{messages.header.eyebrow}</p>
          <h1>{messages.header.title}</h1>
          <p>{messages.noScript.intro}</p>
        </header>
        {initialStateInvalid ? (
          <aside aria-label={messages.invalidState.title} role="alert">
            <h2 id="no-script-invalid-scale-state-heading">{messages.invalidState.title}</h2>
            <p>{messages.noScript.invalidDescription}</p>
          </aside>
        ) : null}
        <section aria-labelledby="no-script-selected-scale-heading">
          <h2 id="no-script-selected-scale-heading">{selected.name}</h2>
          <p>
            {formatMessageTemplate(messages.noScript.selectedSummary, {
              displayValue: selected.display_value,
              quantity: quantityLabel(selected.characteristic_quantity, messages.quantities),
            })}
          </p>
          <p>
            {formatMessageTemplate(messages.noScript.sourceSummary, {
              position: formatLocaleFixedNumber(selected.display_position_percent, 1, locale),
              sourceQuantity: sourceQuantityLabel(
                selected.source_quantity,
                messages.sourceQuantities,
              ),
              sourceUnit: selected.source_unit,
              sourceValue: formatLocaleNumber(selected.source_value, locale),
              status: statusLabel(selected.value_status, messages.statuses),
            })}
          </p>
          <p>
            {messages.noScript.tableHeaders.comparison}: {model.selected.comparison.text}
          </p>
          <p>{selected.source_basis}</p>
          <p>
            {messages.noScript.tableHeaders.transition}: {selected.transition_explanation.text}
          </p>
        </section>
        <section aria-labelledby="no-script-data-heading">
          <h2 id="no-script-data-heading">{messages.noScript.dataTitle}</h2>
          <p>{messages.noScript.dataDescription}</p>
          <div style={{ overflowX: "auto" }}>
            <table>
              <caption>{messages.noScript.tableCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{messages.noScript.tableHeaders.node}</th>
                  <th scope="col">{messages.noScript.tableHeaders.characteristicSize}</th>
                  <th scope="col">{messages.noScript.tableHeaders.comparison}</th>
                  <th scope="col">{messages.noScript.tableHeaders.transition}</th>
                  <th scope="col">{messages.noScript.tableHeaders.sourceStatus}</th>
                  <th scope="col">{messages.noScript.tableHeaders.evidence}</th>
                </tr>
              </thead>
              <tbody>
                {model.nodes.map((entry) => (
                  <tr key={entry.node.id}>
                    <th scope="row">
                      {entry.node.name}
                      {entry.node.id === selected.id ? messages.noScript.selectedSuffix : ""}
                    </th>
                    <td>
                      {entry.node.display_value} (
                      {quantityLabel(entry.node.characteristic_quantity, messages.quantities)};{" "}
                      {sourceQuantityLabel(entry.node.source_quantity, messages.sourceQuantities)})
                    </td>
                    <td>{entry.comparison.text}</td>
                    <td>{entry.node.transition_explanation.text}</td>
                    <td>
                      {formatMessageTemplate(messages.noScript.tableStatus, {
                        position: formatDisplayPosition(entry.position_percent, locale),
                        status: statusLabel(entry.node.value_status, messages.statuses),
                      })}
                    </td>
                    <td>
                      {formatMessageTemplate(messages.noScript.tableSourceEvidence, {
                        characteristic: entry.node.source_ids.join(", "),
                        transition: entry.node.transition_explanation.source_ids.join(", "),
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section aria-labelledby="no-script-model-heading">
          <h2 id="no-script-model-heading">{messages.noScript.model.title}</h2>
          <p>
            <strong>{messages.noScript.model.model}</strong>{" "}
            {SCALE_EXPLORER_DEFINITION.model_version}; <strong>input:</strong>{" "}
            {SCALE_EXPLORER_DEFINITION.input_schema.name}; input unit:{" "}
            {SCALE_EXPLORER_DEFINITION.input_schema.unit}; calculation unit: m. Log position is
            diagram-only, not physical arrangement.
          </p>
          <p>
            <strong>{messages.noScript.model.relationships}</strong> km/ly inputs → m;
            characteristic diameter = 2 × radius for radius entries; direct diameters, widths, and
            extents stay labeled; ratio = selected/reference; p = 100 × (log10(S) − log10(Smin)) /
            (log10(Smax) − log10(Smin)); 1 ly ≈ 9.46 × 10^15 m.
          </p>
          <p>
            <strong>{messages.noScript.model.assumptions}</strong> One labeled size per node;
            rounded sources remain approximate; no distance, nesting, or co-location; light-year
            conversion is approximate.
          </p>
          <p>
            <strong>{messages.noScript.model.knownLimitations}</strong> Curated, no interpolation;
            planet radii become definitional diameters; the Moon keeps its direct diameter;
            galaxy/universe extents are broad; observable ≠ entire universe.
          </p>
          <h3>{messages.noScript.model.references}</h3>
          <SourceReferences
            messages={messages.sources}
            sourceIds={SCALE_EXPLORER_DEFINITION.references}
          />
        </section>
      </article>
    </noscript>
  );
}
