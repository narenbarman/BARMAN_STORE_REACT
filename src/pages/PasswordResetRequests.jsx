import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Mail, MessageCircle, RefreshCw, XCircle } from 'lucide-react';
import { adminApi, usersApi } from '../services/api';

const rowActionStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 42,
};

function PasswordResetRequests() {
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingKey, setProcessingKey] = useState('');
  const [preparedNotifications, setPreparedNotifications] = useState({});

  const fetchData = async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');
      const [resetRequests, allUsers] = await Promise.all([
        adminApi.getPasswordResetRequests(),
        usersApi.getAll(),
      ]);
      setRequests(Array.isArray(resetRequests) ? resetRequests : []);
      setUsers(Array.isArray(allUsers) ? allUsers : []);
    } catch (_) {
      setError('Failed to load account actions data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const customerUsers = useMemo(
    () => users.filter((u) => String(u?.role || '').toLowerCase() !== 'admin'),
    [users]
  );
  const emailQueue = useMemo(
    () => customerUsers.filter((u) => u.email && !u.email_verified),
    [customerUsers]
  );
  const phoneQueue = useMemo(
    () => customerUsers.filter((u) => u.phone && !u.phone_verified),
    [customerUsers]
  );

  const openNotificationLink = (url) => {
    const link = String(url || '').trim();
    if (!link) return;
    if (link.startsWith('mailto:')) {
      window.location.href = link;
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const markSentSafe = async (eventId) => {
    const id = Number(eventId || 0);
    if (!id) return;
    try {
      await adminApi.markNotificationSent(id);
    } catch (_) {
      // best effort only
    }
  };

  const handleCopyText = async (value, label) => {
    try {
      const text = String(value || '').trim();
      if (!text) return;
      if (!navigator?.clipboard?.writeText) {
        setError('Clipboard API is not available in this browser');
        return;
      }
      await navigator.clipboard.writeText(text);
      setSuccess(`${label} copied`);
    } catch (_) {
      setError(`Failed to copy ${String(label || 'text').toLowerCase()}`);
    }
  };

  const handleApproveAndSend = async (requestRow, channel) => {
    const requestId = Number(requestRow?.id || 0);
    if (!requestId) return;
    try {
      setError('');
      setSuccess('');
      setProcessingKey(`reset:${requestId}:${channel}`);
      const result = await adminApi.updatePasswordResetRequest(requestId, {
        status: 'approved',
        notify_channel: channel,
      });
      const notification = result?.notification || {};
      setPreparedNotifications((prev) => ({ ...prev, [`reset:${requestId}`]: notification }));

      if (channel === 'email' && notification?.email) {
        openNotificationLink(notification.email.mailto_url);
        await markSentSafe(notification.email.event_id);
      }
      if (channel === 'whatsapp' && notification?.whatsapp) {
        openNotificationLink(notification.whatsapp.whatsapp_url);
        await markSentSafe(notification.whatsapp.event_id);
      }
      setSuccess('Password reset approved and template prepared');
      await fetchData({ silent: true });
    } catch (e) {
      setError(e?.message || 'Failed to process reset request');
    } finally {
      setProcessingKey('');
    }
  };

  const handleReject = async (requestRow) => {
    const requestId = Number(requestRow?.id || 0);
    if (!requestId) return;
    try {
      setError('');
      setSuccess('');
      setProcessingKey(`reset:${requestId}:reject`);
      await adminApi.updatePasswordResetRequest(requestId, { status: 'rejected' });
      setSuccess('Password reset request rejected');
      await fetchData({ silent: true });
    } catch (e) {
      setError(e?.message || 'Failed to reject request');
    } finally {
      setProcessingKey('');
    }
  };

  const handlePrepareEmailVerification = async (row) => {
    const userId = Number(row?.id || 0);
    if (!userId) return;
    try {
      setError('');
      setSuccess('');
      setProcessingKey(`email:${userId}:prepare`);
      const result = await adminApi.prepareEmailNotification({
        type: 'email_verification',
        user_id: userId,
      });
      const delivery = result?.delivery || {};
      const preparedEmail = result?.prepared_email || delivery?.email || null;
      if (!preparedEmail) throw new Error('Prepared email content not returned');
      const notification = {
        event_id: Number(delivery?.event_id || 0) || null,
        ...preparedEmail,
      };
      setPreparedNotifications((prev) => ({ ...prev, [`email:${userId}`]: notification }));
      openNotificationLink(notification.mailto_url);
      await markSentSafe(notification.event_id);
      setSuccess('Email verification template prepared');
    } catch (e) {
      setError(e?.message || 'Failed to prepare email verification');
    } finally {
      setProcessingKey('');
    }
  };

  const handleMarkEmailVerified = async (row) => {
    const userId = Number(row?.id || 0);
    if (!userId) return;
    try {
      setError('');
      setSuccess('');
      setProcessingKey(`email:${userId}:verify`);
      const result = await adminApi.markUserEmailVerified(userId);
      setPreparedNotifications((prev) => {
        const next = { ...prev };
        delete next[`email:${userId}`];
        return next;
      });
      setSuccess(result?.message || 'Email marked as verified');
      await fetchData({ silent: true });
    } catch (e) {
      setError(e?.message || 'Failed to mark email verified');
    } finally {
      setProcessingKey('');
    }
  };

  const handlePreparePhoneVerification = async (row) => {
    const userId = Number(row?.id || 0);
    if (!userId) return;
    try {
      setError('');
      setSuccess('');
      setProcessingKey(`phone:${userId}:prepare`);
      const result = await adminApi.prepareWhatsAppNotification({
        type: 'phone_verification',
        user_id: userId,
      });
      const delivery = result?.delivery || {};
      const preparedWhatsApp = result?.prepared_whatsapp || delivery?.whatsapp || null;
      if (!preparedWhatsApp) throw new Error('Prepared WhatsApp content not returned');
      const notification = {
        event_id: Number(delivery?.event_id || 0) || null,
        ...preparedWhatsApp,
      };
      setPreparedNotifications((prev) => ({ ...prev, [`phone:${userId}`]: notification }));
      openNotificationLink(notification.whatsapp_url);
      await markSentSafe(notification.event_id);
      setSuccess('Phone verification message prepared');
    } catch (e) {
      setError(e?.message || 'Failed to prepare phone verification');
    } finally {
      setProcessingKey('');
    }
  };

  const handleMarkPhoneVerified = async (row) => {
    const userId = Number(row?.id || 0);
    if (!userId) return;
    try {
      setError('');
      setSuccess('');
      setProcessingKey(`phone:${userId}:verify`);
      const result = await adminApi.markUserPhoneVerified(userId);
      setPreparedNotifications((prev) => {
        const next = { ...prev };
        delete next[`phone:${userId}`];
        return next;
      });
      setSuccess(result?.message || 'Phone marked as verified');
      await fetchData({ silent: true });
    } catch (e) {
      setError(e?.message || 'Failed to mark phone verified');
    } finally {
      setProcessingKey('');
    }
  };

  if (loading) return <div className="billing-content"><p>Loading account actions...</p></div>;

  return (
    <div className="billing-content account-actions">
      <div className="account-actions-header">
        <h1>Account Actions</h1>
        <button className="admin-btn" onClick={() => fetchData({ silent: true })} disabled={refreshing || !!processingKey}>
          {refreshing ? <Loader2 size={16} className="spinning" /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>
      <p className="account-actions-subtitle">
        Manage password resets, email verification, and phone verification from one queue.
      </p>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <section className="account-actions-section">
        <h2>Password Reset Requests</h2>
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
              {requests.length === 0 ? (
                <tr>
                  <td colSpan="6">No password reset requests.</td>
                </tr>
              ) : requests.map((r) => {
                const emailProcessing = processingKey === `reset:${r.id}:email`;
                const whatsappProcessing = processingKey === `reset:${r.id}:whatsapp`;
                const rejectProcessing = processingKey === `reset:${r.id}:reject`;
                const prepared = preparedNotifications[`reset:${r.id}`] || {};
                return (
                  <tr key={r.id}>
                    <td>{r.user_name || '-'}</td>
                    <td>{r.email || '-'}</td>
                    <td>{r.phone || '-'}</td>
                    <td>{r.reason || '-'}</td>
                    <td>{r.status}</td>
                    <td>
                      {r.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            className="admin-btn"
                            title={r.email ? 'Approve and send via Email' : 'Email is not available'}
                            onClick={() => handleApproveAndSend(r, 'email')}
                            disabled={!r.email || !!processingKey}
                            style={rowActionStyle}
                          >
                            {emailProcessing ? <Loader2 size={16} className="spinning" /> : <Mail size={16} />}
                          </button>
                          <button
                            className="admin-btn"
                            title={r.phone ? 'Approve and send via WhatsApp' : 'Phone is not available'}
                            onClick={() => handleApproveAndSend(r, 'whatsapp')}
                            disabled={!r.phone || !!processingKey}
                            style={rowActionStyle}
                          >
                            {whatsappProcessing ? <Loader2 size={16} className="spinning" /> : <MessageCircle size={16} />}
                          </button>
                          <button
                            className="admin-btn"
                            title="Reject request"
                            onClick={() => handleReject(r)}
                            disabled={!!processingKey}
                            style={rowActionStyle}
                          >
                            {rejectProcessing ? <Loader2 size={16} className="spinning" /> : <XCircle size={16} />}
                          </button>
                        </div>
                      ) : (
                        <span>{r.status}</span>
                      )}

                      {prepared?.email && (
                        <div className="prepared-message-box">
                          <strong>Prepared Email</strong>
                          <textarea readOnly rows={4} value={prepared.email.body || ''} />
                          <div className="prepared-actions">
                            <button className="admin-btn" onClick={() => handleCopyText(prepared.email.subject, 'Subject')}>
                              Copy Subject
                            </button>
                            <button className="admin-btn" onClick={() => handleCopyText(prepared.email.body, 'Body')}>
                              Copy Body
                            </button>
                            {prepared.email.mailto_url && <a className="admin-btn" href={prepared.email.mailto_url}>Open Email App</a>}
                          </div>
                        </div>
                      )}
                      {prepared?.whatsapp && (
                        <div className="prepared-message-box">
                          <strong>Prepared WhatsApp</strong>
                          <textarea readOnly rows={4} value={prepared.whatsapp.text || ''} />
                          <div className="prepared-actions">
                            <button className="admin-btn" onClick={() => handleCopyText(prepared.whatsapp.text, 'Message')}>
                              Copy Message
                            </button>
                            {prepared.whatsapp.whatsapp_url && (
                              <a className="admin-btn" href={prepared.whatsapp.whatsapp_url} target="_blank" rel="noreferrer">
                                Open WhatsApp
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="account-actions-section">
        <h2>Email Verification Tasks</h2>
        <div className="table-container">
          <table className="billing-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {emailQueue.length === 0 ? (
                <tr>
                  <td colSpan="4">No pending email verification tasks.</td>
                </tr>
              ) : emailQueue.map((u) => {
                const prepareProcessing = processingKey === `email:${u.id}:prepare`;
                const verifyProcessing = processingKey === `email:${u.id}:verify`;
                const prepared = preparedNotifications[`email:${u.id}`];
                return (
                  <tr key={`email-${u.id}`}>
                    <td>{u.name || '-'}</td>
                    <td>{u.email || '-'}</td>
                    <td>{u.email_verified ? 'Verified' : 'Unverified'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          className="admin-btn"
                          title="Prepare verification email"
                          onClick={() => handlePrepareEmailVerification(u)}
                          disabled={!!processingKey}
                          style={rowActionStyle}
                        >
                          {prepareProcessing ? <Loader2 size={16} className="spinning" /> : <Mail size={16} />}
                        </button>
                        <button
                          className="admin-btn"
                          title="Mark email verified"
                          onClick={() => handleMarkEmailVerified(u)}
                          disabled={!!processingKey}
                          style={rowActionStyle}
                        >
                          {verifyProcessing ? <Loader2 size={16} className="spinning" /> : <CheckCircle2 size={16} />}
                        </button>
                      </div>
                      {prepared && (
                        <div className="prepared-message-box">
                          <strong>Prepared Email</strong>
                          <textarea readOnly rows={4} value={prepared.body || ''} />
                          <div className="prepared-actions">
                            <button className="admin-btn" onClick={() => handleCopyText(prepared.subject, 'Subject')}>
                              Copy Subject
                            </button>
                            <button className="admin-btn" onClick={() => handleCopyText(prepared.body, 'Body')}>
                              Copy Body
                            </button>
                            {prepared.mailto_url && <a className="admin-btn" href={prepared.mailto_url}>Open Email App</a>}
                            {prepared.link && (
                              <a className="admin-btn" href={prepared.link} target="_blank" rel="noreferrer">
                                Open Verification Link
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="account-actions-section">
        <h2>Phone Verification Tasks</h2>
        <div className="table-container">
          <table className="billing-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {phoneQueue.length === 0 ? (
                <tr>
                  <td colSpan="4">No pending phone verification tasks.</td>
                </tr>
              ) : phoneQueue.map((u) => {
                const prepareProcessing = processingKey === `phone:${u.id}:prepare`;
                const verifyProcessing = processingKey === `phone:${u.id}:verify`;
                const prepared = preparedNotifications[`phone:${u.id}`];
                return (
                  <tr key={`phone-${u.id}`}>
                    <td>{u.name || '-'}</td>
                    <td>{u.phone || '-'}</td>
                    <td>{u.phone_verified ? 'Verified' : 'Unverified'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          className="admin-btn"
                          title="Prepare verification WhatsApp message"
                          onClick={() => handlePreparePhoneVerification(u)}
                          disabled={!!processingKey}
                          style={rowActionStyle}
                        >
                          {prepareProcessing ? <Loader2 size={16} className="spinning" /> : <MessageCircle size={16} />}
                        </button>
                        <button
                          className="admin-btn"
                          title="Mark phone verified"
                          onClick={() => handleMarkPhoneVerified(u)}
                          disabled={!!processingKey}
                          style={rowActionStyle}
                        >
                          {verifyProcessing ? <Loader2 size={16} className="spinning" /> : <CheckCircle2 size={16} />}
                        </button>
                      </div>
                      {prepared && (
                        <div className="prepared-message-box">
                          <strong>Prepared WhatsApp</strong>
                          <textarea readOnly rows={4} value={prepared.text || ''} />
                          <div className="prepared-actions">
                            <button className="admin-btn" onClick={() => handleCopyText(prepared.text, 'Message')}>
                              Copy Message
                            </button>
                            {prepared.whatsapp_url && (
                              <a className="admin-btn" href={prepared.whatsapp_url} target="_blank" rel="noreferrer">
                                Open WhatsApp
                              </a>
                            )}
                            {prepared.link && (
                              <a className="admin-btn" href={prepared.link} target="_blank" rel="noreferrer">
                                Open Verification Link
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default PasswordResetRequests;
