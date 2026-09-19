export default function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="m-0 border border-line rounded-b-md overflow-x-auto font-mono text-[13px] leading-[1.7] bg-card">
      <code className="block py-3">
        {diff.split("\n").map((line, i) => {
          const cls = line.startsWith("+")
            ? "bg-ok-soft text-ok"
            : line.startsWith("-")
              ? "bg-cause-soft text-cause"
              : line.startsWith("@@")
                ? "text-ink-3"
                : "";
          return (
            <span key={i} className={`block px-3.5 whitespace-pre ${cls}`}>
              {line || " "}
            </span>
          );
        })}
      </code>
    </pre>
  );
}
