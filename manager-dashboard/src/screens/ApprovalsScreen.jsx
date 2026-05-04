import { CheckCircle2, Loader2 } from 'lucide-react';

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function ApprovalsScreen({ approvals, workingId, onApprove }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>Operator Approvals</h3>
        <span>{approvals.length} waiting</span>
      </div>

      {!approvals.length ? (
        <div className="empty-state">No pending operator approvals.</div>
      ) : (
        <div className="approval-list">
          {approvals.map((account) => (
            <article className="approval-row" key={account.id}>
              <div>
                <strong>{account.full_name || account.email || 'Operator'}</strong>
                <p>{account.email || 'No email'} requested {formatDateTime(account.created_at)}</p>
              </div>
              <button type="button" onClick={() => onApprove(account)} disabled={workingId === account.id}>
                {workingId === account.id ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
                Approve
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
