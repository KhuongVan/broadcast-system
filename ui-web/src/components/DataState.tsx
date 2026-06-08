type DataStateProps = {
  loading: boolean;
  error: string;
  empty: boolean;
  emptyText?: string;
};

export function DataState({ loading, error, empty, emptyText = 'Chưa có dữ liệu.' }: DataStateProps) {
  if (loading) return <div className="state">Đang tải dữ liệu...</div>;
  if (error) return <div className="state error">{error}</div>;
  if (empty) return <div className="state">{emptyText}</div>;
  return null;
}
