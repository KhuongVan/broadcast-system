type StatusBadgeProps = {
  tone?: 'ok' | 'warn' | 'danger' | 'neutral';
  children: string;
};

export function StatusBadge({ tone = 'neutral', children }: StatusBadgeProps) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
