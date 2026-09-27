interface ErrorStateProps {
  onRetry: () => void
}

export function LoadingState() {
  return (
    <section className="data-state loading-state" aria-live="polite">
      <span className="loading-bar" />
      <span className="loading-bar short" />
      <span className="loading-bar" />
      <p>Đang tải dữ liệu...</p>
    </section>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="data-state">
      <p className="state-kicker">CHƯA CÓ DỮ LIỆU</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  )
}

export function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <section className="data-state error-state" role="alert">
      <p className="state-kicker">KHÔNG THỂ TẢI DỮ LIỆU</p>
      <h2>Đã có lỗi khi tải dữ liệu trang</h2>
      <p>Kiểm tra lại kết nối, sau đó thử tải lại dữ liệu.</p>
      <button className="secondary-button" type="button" onClick={onRetry}>Tải lại</button>
    </section>
  )
}

export function PermissionDeniedState() {
  return (
    <section className="data-state permission-denied-state" role="alert">
      <p className="state-kicker">KHÔNG CÓ QUYỀN TRUY CẬP</p>
      <h2>Bạn không có quyền thực hiện chức năng này.</h2>
      <p>Vai trò hiện tại chưa được cấp quyền phù hợp. Liên hệ quản trị viên nếu bạn cần được hỗ trợ.</p>
    </section>
  )
}
