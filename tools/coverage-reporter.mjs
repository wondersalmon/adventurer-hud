/** Keep runtime and tooling coverage separate; no arbitrary global pass threshold. */
export default async function* coverageReporter(events) {
  for await (const event of events) {
    if (event.type !== "test:coverage") continue;
    const { files, ...totals } = event.data.summary;
    const groups = { runtime: [], tooling: [] };
    for (const file of files) {
      const name = file.path.replaceAll("\\", "/");
      if (name.includes("/scripts/")) groups.runtime.push(file);
      else if (name.includes("/tools/")) groups.tooling.push(file);
    }
    const groupTotals = Object.fromEntries(
      Object.entries(groups).map(([name, rows]) => [
        name,
        Object.fromEntries(
          ["Line", "Branch", "Function"].map(kind => {
            const total = rows.reduce(
              (sum, row) => sum + (row[`total${kind}Count`] ?? 0),
              0
            );
            const covered = rows.reduce(
              (sum, row) => sum + (row[`covered${kind}Count`] ?? 0),
              0
            );
            return [
              kind.toLowerCase(),
              {
                total,
                covered,
                percent: total ? (100 * covered) / total : null
              }
            ];
          })
        )
      ])
    );
    yield JSON.stringify({ totals, groupTotals, groups }, null, 2) + "\n";
  }
}
