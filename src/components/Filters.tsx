import { NO_FILTERS, filtersOn, owners, type Ctx } from "../lib/ctx";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/model";

export function FilterSelect({ label, value, onChange, all, options }: { label: string; value: string; onChange: (v: string) => void; all: string; options: [string, string][] }) {
  return (
    <label className="flex items-center">
      <span className="sr-only-x">{label}</span>
      <select className="field" style={{ width: "auto", maxWidth: 190, borderRadius: 999, borderColor: value ? "var(--color-accent)" : undefined }} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/** Facility, status and owner filters, shared by the timeline and the project list. */
export function FilterBar({ ctx }: { ctx: Ctx }) {
  const { plan, filters, setFilters, query } = ctx;
  return (
    <>
      <FilterSelect label="Facility" value={filters.facility} onChange={(v) => setFilters({ ...filters, facility: v })} all="All facilities" options={plan.facilities.map((f) => [f, f])} />
      <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} all="All statuses" options={STATUS_ORDER.map((s) => [s, STATUS_LABEL[s]])} />
      <FilterSelect label="Owner" value={filters.owner} onChange={(v) => setFilters({ ...filters, owner: v })} all="All owners" options={owners(plan).map((o) => [o, o])} />
      {filtersOn(query, filters) && <button type="button" className="btn btn-sm" style={{ borderRadius: 999 }} onClick={() => { setFilters(NO_FILTERS); ctx.setQuery(""); }}>Clear filters</button>}
    </>
  );
}
