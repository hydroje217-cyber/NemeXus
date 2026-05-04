const ROLE_OPTIONS = ['operator', 'supervisor', 'manager', 'admin'];

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

export default function AccountsScreen({ accounts, workingId, onRoleChange }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>Account Roles</h3>
        <span>{accounts.length} accounts</span>
      </div>

      {!accounts.length ? (
        <div className="empty-state">No accounts found.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Approved</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.full_name || '-'}</td>
                  <td>{account.email || '-'}</td>
                  <td>
                    <select
                      value={account.role || 'operator'}
                      disabled={workingId === account.id}
                      onChange={(event) => onRoleChange(account, event.target.value)}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{account.is_approved ? 'Yes' : 'No'}</td>
                  <td>{formatDateTime(account.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
