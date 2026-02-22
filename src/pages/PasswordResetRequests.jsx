import { useEffect, useState } from 'react';
import { adminApi } from '../services/api';

const isStrongPassword = (password) => {
  const value = String(password || '');
  return (
    value.length >= 10 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
};

function PasswordResetRequests() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [formInputs, setFormInputs] = useState({});
  const [processingId, setProcessingId] = useState(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setRequests(await adminApi.getPasswordResetRequests());
    } catch (e) {
      setError('Failed to load password reset requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAction = async (id, status) => {
    try {
      setProcessingId(id);
      setError('');
      const inputs = formInputs[id] || {};
      const payload = { status };
      if (status === 'approved' && !isStrongPassword(inputs.new_password || '')) {
        setError('Approved reset requires a strong password (10+ chars with upper/lower/number/special).');
        setProcessingId(null);
        return;
      }
      if (inputs.admin_note) payload.admin_note = inputs.admin_note;
      if (status === 'approved' && inputs.new_password) payload.new_password = inputs.new_password;

      await adminApi.updatePasswordResetRequest(id, payload);
      // clear inputs for this id
      setFormInputs((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      await fetchRequests();
    } catch (e) {
      setError('Failed to update request');
    } finally {
      setProcessingId(null);
    }
  };

  const updateInput = (id, field, value) => {
    setFormInputs((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };

  if (loading) return <div className="billing-content"><p>Loading reset requests...</p></div>;

  return (
    <div className="billing-content">
      <h1>Password Reset Requests</h1>
      {error && <div className="error-message">{error}</div>}
      <div className="table-container">
        <table className="billing-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.user_name || '-'}</td>
                <td>{r.email || '-'}</td>
                <td>{r.phone || '-'}</td>
                <td>{r.reason || '-'}</td>
                <td>{r.status}</td>
                <td>
                  {r.status === 'pending' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <input
                        type="password"
                        placeholder="Set new strong password (required)"
                        value={(formInputs[r.id] && formInputs[r.id].new_password) || ''}
                        onChange={(e) => updateInput(r.id, 'new_password', e.target.value)}
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                        disabled={processingId === r.id}
                      />
                      <textarea
                        placeholder="Admin note (optional)"
                        value={(formInputs[r.id] && formInputs[r.id].admin_note) || ''}
                        onChange={(e) => updateInput(r.id, 'admin_note', e.target.value)}
                        rows={2}
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}
                        disabled={processingId === r.id}
                      />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="admin-btn"
                          onClick={() => handleAction(r.id, 'approved')}
                          disabled={processingId === r.id}
                        >
                          {processingId === r.id ? 'Processing...' : 'Approve'}
                        </button>
                        <button
                          className="admin-btn"
                          onClick={() => handleAction(r.id, 'rejected')}
                          disabled={processingId === r.id}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span>{r.status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PasswordResetRequests;
