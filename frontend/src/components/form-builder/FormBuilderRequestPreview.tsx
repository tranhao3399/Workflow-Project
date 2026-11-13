import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Clock3, MessageSquareText } from 'lucide-react'
import type { FormDefinition } from '../../types/workflow'
import { formatAuditSentence } from '../../utils/audit-display'
import { formatDateTime } from '../../utils/formatters'
import { DynamicFormRenderer } from '../dynamic-form'
import './form-builder-preview.css'

interface FormBuilderRequestPreviewProps {
  formDefinition: FormDefinition
  createdAt: string
}

type ChatterTab = 'COMMENT' | 'HISTORY'

const commentMaxHeight = 170

export function FormBuilderRequestPreview({
  formDefinition,
  createdAt,
}: FormBuilderRequestPreviewProps) {
  const [chatterTab, setChatterTab] = useState<ChatterTab>('COMMENT')
  const [comment, setComment] = useState('')
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  const dynamicDefinition = useMemo<FormDefinition>(
    () => ({
      ...formDefinition,
      description: undefined,
      fields: formDefinition.fields,
    }),
    [formDefinition],
  )

  useLayoutEffect(() => {
    const input = commentInputRef.current
    if (!input || chatterTab !== 'COMMENT') return
    input.style.height = 'auto'
    const nextHeight = Math.min(input.scrollHeight, commentMaxHeight)
    input.style.height = `${nextHeight}px`
    input.style.overflowY = input.scrollHeight > commentMaxHeight ? 'auto' : 'hidden'
  }, [chatterTab, comment])

  return (
    <div className="form-builder-request-preview">
      <section className="form-preview-sheet" aria-label="Tờ phiếu xem trước">
        <header className="form-preview-sheet-header">
          <div className="form-preview-heading-copy">
            <h2>{formDefinition.name}</h2>
            {formDefinition.description && <p>{formDefinition.description}</p>}
          </div>
        </header>

        <section className="form-preview-dynamic-fields" aria-label="Nội dung phiếu">
          <DynamicFormRenderer
            formDefinition={dynamicDefinition}
            mode="preview"
            systemAutoFillValues={{
              REQUEST_CODE: '#PHIẾU-MỚI',
              REQUEST_STATUS: 'Bản nháp',
              REQUESTER_EMPLOYEE_CODE: 'NV001',
              REQUESTER_FULL_NAME: 'Trần Chí Hào',
              REQUESTER_DEPARTMENT_NAME: 'Phòng Công nghệ thông tin',
              REQUESTER_WORK_UNIT_NAME: 'NexaSport',
              REQUESTER_POSITION_NAME: 'Chuyên viên phân tích nghiệp vụ',
              REQUESTER_ANNUAL_LEAVE_DAYS: 12,
              REQUESTER_DIRECT_MANAGER_NAME: 'Nguyễn Văn Minh',
              REQUESTER_EMAIL: 'tranchihao@nexasport.vn',
              REQUESTER_PHONE: '0901234567',
              CURRENT_DATE: createdAt.slice(0, 10),
            }}
          />
        </section>
      </section>

      <aside className="form-preview-sidebar" aria-label="Trao đổi và lịch sử phiếu">
        <section className="form-preview-side-card form-preview-chatter">
          <div className="form-preview-side-heading">
            <MessageSquareText size={17} strokeWidth={1.9} aria-hidden="true" />
            <h3>Trao đổi & Lịch sử</h3>
          </div>
          <div className="form-preview-chatter-tabs" role="tablist" aria-label="Trao đổi và lịch sử">
            <button type="button" role="tab" aria-selected={chatterTab === 'COMMENT'} className={chatterTab === 'COMMENT' ? 'is-active' : ''} onClick={() => setChatterTab('COMMENT')}>Bình luận</button>
            <button type="button" role="tab" aria-selected={chatterTab === 'HISTORY'} className={chatterTab === 'HISTORY' ? 'is-active' : ''} onClick={() => setChatterTab('HISTORY')}>Lịch sử thao tác</button>
          </div>
          {chatterTab === 'COMMENT' ? (
            <div className="form-preview-comment-box">
              <textarea ref={commentInputRef} value={comment} rows={3} placeholder="Nhập bình luận..." aria-label="Nội dung bình luận" onChange={(event) => setComment(event.target.value)} />
              <button type="button" disabled={!comment.trim()}>Gửi bình luận</button>
            </div>
          ) : (
            <ol className="form-preview-history-list">
              <li className="form-preview-history-item">
                <span className="form-preview-avatar is-small" aria-hidden="true">TH</span>
                <div><strong>{formatAuditSentence({ action: 'CREATED', actorLabel: 'Trần Chí Hào', resourceType: 'REQUEST', resourceName: formDefinition.name || 'Phiếu mới' })}</strong><small><Clock3 size={13} aria-hidden="true" />{formatDateTime(createdAt, 'date-first')}</small></div>
              </li>
            </ol>
          )}
        </section>
      </aside>
    </div>
  )
}
