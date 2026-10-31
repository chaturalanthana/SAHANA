import type { ReactNode } from 'react';

export type DataColumn = { key: string; header: string };

export function DataTable({
  columns,
  rows,
}: {
  columns: DataColumn[];
  rows: ({ id?: string } & Record<string, ReactNode>)[];
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="border-b border-border px-3 py-3 text-left font-semibold text-heading">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id ?? String(index)} className="odd:bg-bg/60">
                {columns.map((column) => (
                  <td key={column.key} className="border-b border-border px-3 py-3 text-body break-words">
                    {row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row, index) => (
          <li key={row.id ?? String(index)} className="rounded-md border border-border p-3">
            {columns.map((column) => (
              <p key={column.key} className="text-sm break-words">
                <span className="font-semibold text-heading">{column.header}: </span>
                <span className="text-body">{row[column.key]}</span>
              </p>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}
