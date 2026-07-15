import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="PropShield home">
      <span className="brand-mark" aria-hidden="true"><span /></span>
      {!compact && <span>PropShield</span>}
    </Link>
  );
}
