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
}>;

const quantityLabels: Record<ScaleExplorerNode["characteristic_quantity"], string> = {
  diameter: "characteristic diameter",
  width: "characteristic width",
  "observable-extent": "observable-universe extent",
};

const sourceQuantityLabels: Record<ScaleExplorerNode["source_quantity"], string> = {
  radius: "source radius",
  diameter: "source diameter",
  width: "source width",
  extent: "source extent",
};

function formatDisplayPosition(positionPercent: number): string {
  return `${positionPercent.toFixed(1)}%`;
}

function sourceForId(id: string) {
  return SCALE_EXPLORER_SOURCES.find((source) => source.id === id);
}

function SourceReferences({ sourceIds }: Readonly<{ sourceIds: ReadonlyArray<string> }>) {
  return (
    <ul>
      {sourceIds.map((sourceId) => {
        const source = sourceForId(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>Unavailable source record: {sourceId}</>
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
}: ScaleExplorerNoScriptProps) {
  const model = buildScaleExplorerModel(initialState);
  const selected = model.selected.node;

  return (
    <noscript>
      <article>
        <header>
          <p>First Phase 3B lab</p>
          <h1>Scale Explorer</h1>
          <p>Compare cited astronomical sizes without JavaScript.</p>
        </header>
        {initialStateInvalid ? (
          <aside aria-label="The shared scale state was not valid" role="alert">
            <h2 id="no-script-invalid-scale-state-heading">The shared scale state was not valid</h2>
            <p>
              Earth is shown as the safe default because the requested version, node, field set, or
              serialized form was not accepted.
            </p>
          </aside>
        ) : null}
        <section aria-labelledby="no-script-selected-scale-heading">
          <h2 id="no-script-selected-scale-heading">{selected.name}</h2>
          <p>
            {selected.display_value} {quantityLabels[selected.characteristic_quantity]}
          </p>
          <p>
            Source: {selected.source_value} {selected.source_unit} ({selected.source_quantity});
            status: {selected.value_status}; display: {selected.display_position_percent.toFixed(1)}
            % logarithmic.
          </p>
          <p>Comparison: {model.selected.comparison.text}</p>
          <p>{selected.source_basis}</p>
          <p>Transition: {selected.transition_explanation.text}</p>
        </section>
        <section aria-labelledby="no-script-data-heading">
          <h2 id="no-script-data-heading">Text and data alternative</h2>
          <p>
            Same curated nodes, ordered by characteristic size. Each row includes its characteristic
            quantity and normalized logarithmic display position. The log coordinate is
            dimensionless, not a physical location.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table>
              <caption>
                Scale nodes, characteristic and source quantities, normalized display positions,
                status, and evidence.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Node</th>
                  <th scope="col">Characteristic size</th>
                  <th scope="col">Comparison</th>
                  <th scope="col">Transition</th>
                  <th scope="col">Source status</th>
                  <th scope="col">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {model.nodes.map((entry) => (
                  <tr key={entry.node.id}>
                    <th scope="row">
                      {entry.node.name}
                      {entry.node.id === selected.id ? " (selected)" : ""}
                    </th>
                    <td>
                      {entry.node.display_value} (
                      {quantityLabels[entry.node.characteristic_quantity]};{" "}
                      {sourceQuantityLabels[entry.node.source_quantity]})
                    </td>
                    <td>{entry.comparison.text}</td>
                    <td>{entry.node.transition_explanation.text}</td>
                    <td>
                      {entry.node.value_status}; normalized logarithmic display position:{" "}
                      {formatDisplayPosition(entry.position_percent)}
                    </td>
                    <td>
                      Characteristic: {entry.node.source_ids.join(", ")}; transition:{" "}
                      {entry.node.transition_explanation.source_ids.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section aria-labelledby="no-script-model-heading">
          <h2 id="no-script-model-heading">Model and assumptions</h2>
          <p>
            <strong>Model:</strong> {SCALE_EXPLORER_DEFINITION.model_version};{" "}
            <strong>input:</strong> {SCALE_EXPLORER_DEFINITION.input_schema.name}; input unit:{" "}
            {SCALE_EXPLORER_DEFINITION.input_schema.unit}; calculation unit: m. Log position is
            diagram-only, not physical arrangement.
          </p>
          <p>
            <strong>Relationships:</strong> km/ly inputs → m; characteristic diameter = 2 × radius
            for radius entries; direct diameters, widths, and extents stay labeled; ratio =
            selected/reference; p = 100 × (log10(S) − log10(Smin)) / (log10(Smax) − log10(Smin)); 1
            ly ≈ 9.46 × 10^15 m.
          </p>
          <p>
            <strong>Assumptions:</strong> One labeled size per node; rounded sources remain
            approximate; no distance, nesting, or co-location; light-year conversion is approximate.
          </p>
          <p>
            <strong>Known limitations:</strong> Curated, no interpolation; planet radii become
            definitional diameters; the Moon keeps its direct diameter; galaxy/universe extents are
            broad; observable ≠ entire universe.
          </p>
          <h3>References</h3>
          <SourceReferences sourceIds={SCALE_EXPLORER_DEFINITION.references} />
        </section>
      </article>
    </noscript>
  );
}
