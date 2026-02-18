import React, { useState, useEffect } from 'react';
import { Download, Trash2, Search } from 'lucide-react';
import { billingApi } from '../services/api';
import { buildWhatsAppUrl } from '../utils/whatsapp';
import company from '../config/company';
import './BillsViewer.css';

const BillsViewer = () => {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);

  // Fetch all bills
  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await billingApi.getAll();
      setBills(data || []);
    } catch (err) {
      console.error('Error fetching bills:', err);
      setError('Failed to load bills. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const deleteBill = async (billId) => {
    if (!window.confirm('Are you sure you want to delete this bill?')) return;

    try {
      const response = await fetch(`/api/bills/${billId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete bill');
      setBills(bills.filter(b => b.id !== billId));
      setSelectedBill(null);
      alert('Bill deleted successfully');
    } catch (err) {
      console.error('Error deleting bill:', err);
      alert('Error deleting bill: ' + err.message);
    }
  };

  const downloadBillPDF = (bill) => {
    // Generate simple PDF content
    const content = `
BILL
======================================
Bill #: ${bill.bill_number}
Date: ${new Date(bill.created_at).toLocaleDateString()}

CUSTOMER DETAILS
Name: ${bill.customer_name}
Email: ${bill.customer_email}
Phone: ${bill.customer_phone}
Address: ${bill.customer_address || 'N/A'}

======================================
Items
======================================
Product | Qty | Unit | Discount | Amount
--------------------------------------
${bill.items?.map(item => `${item.product_name} | ${item.qty} | ${item.unit} | ${item.discount} | ₹${item.amount}`).join('\n')}

======================================
Subtotal: ₹${bill.subtotal}
Discount: ₹${bill.discount_amount}
Total: ₹${bill.total_amount}

Payment Method: ${bill.payment_method}
Payment Status: ${bill.payment_status}
======================================
    `;

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', `${bill.bill_number}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const buildShareText = (bill) => {
    const items = Array.isArray(bill.items) ? bill.items : [];
    const lines = [
      `BILL #${bill.bill_number || ''}`,
      `Date: ${new Date(bill.created_at || Date.now()).toLocaleString()}`,
      `Customer: ${bill.customer_name || ''}`,
      bill.customer_phone ? `Phone: ${bill.customer_phone}` : null,
      bill.customer_email ? `Email: ${bill.customer_email}` : null,
      bill.customer_address ? `Address: ${bill.customer_address}` : null,
      '',
      'Items:'
    ];
    if (items.length === 0) {
      lines.push('- None');
    } else {
      items.forEach((it) => {
        const name = it.product_name || it.name || 'Item';
        const qty = Number(it.qty || it.quantity || 0);
        const unit = it.unit || '';
        const amount = Number(it.amount || 0);
        lines.push(`- ${name} ${qty}${unit ? ' ' + unit : ''} : Rs ${amount}`);
      });
    }
    lines.push('');
    lines.push(`Total: Rs ${Number(bill.total_amount || 0)}`);
    lines.push(`Paid: Rs ${Number(bill.paid_amount || 0)}`);
    lines.push(`Credit: Rs ${Number(bill.credit_amount || 0)}`);
    lines.push(`Status: ${bill.payment_status || ''}`);
    return lines.filter(Boolean).join('\n');
  };

  const buildSmsText = (bill) => {
    const text = `BILL ${bill.bill_number || ''} Total Rs ${Number(bill.total_amount || 0)} Paid Rs ${Number(bill.paid_amount || 0)} Credit Rs ${Number(bill.credit_amount || 0)}. ${company.name}`;
    return text.length > 160 ? text.slice(0, 157) + '...' : text;
  };

  const buildInvoiceHtml = (bill) => {
    const items = Array.isArray(bill.items) ? bill.items : [];
    const rows = items.map((it) => {
      const name = it.product_name || it.name || 'Item';
      const qty = Number(it.qty || it.quantity || 0);
      const unit = it.unit || '';
      const mrp = Number(it.mrp || 0);
      const discount = Number(it.discount || 0);
      const amount = Number(it.amount || 0);
      return `
        <tr>
          <td>${name}</td>
          <td>${qty}${unit ? ' ' + unit : ''}</td>
          <td>Rs ${mrp.toFixed(2)}</td>
          <td>Rs ${discount.toFixed(2)}</td>
          <td>Rs ${amount.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="invoice">
        <div class="invoice-header">
          <div class="invoice-brand">
            ${company.logoPath ? `<img src="${company.logoPath}" alt="Logo" />` : ''}
            <div>
              <div class="company-name">${company.name}</div>
              <div class="company-meta">GST: ${company.gstNumber}</div>
              <div class="company-meta">${company.address}</div>
              <div class="company-meta">${company.phone} | ${company.email}</div>
            </div>
          </div>
          <div class="invoice-info">
            <div><strong>Bill #</strong> ${bill.bill_number || ''}</div>
            <div><strong>Date</strong> ${new Date(bill.created_at || Date.now()).toLocaleString()}</div>
            <div><strong>Status</strong> ${bill.payment_status || ''}</div>
          </div>
        </div>

        <div class="invoice-section">
          <div><strong>Customer</strong></div>
          <div>${bill.customer_name || ''}</div>
          ${bill.customer_phone ? `<div>${bill.customer_phone}</div>` : ''}
          ${bill.customer_email ? `<div>${bill.customer_email}</div>` : ''}
          ${bill.customer_address ? `<div>${bill.customer_address}</div>` : ''}
        </div>

        <table class="invoice-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>MRP</th>
              <th>Discount</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5">No items</td></tr>'}
          </tbody>
        </table>

        <div class="invoice-summary">
          <div><span>Subtotal</span><span>Rs ${Number(bill.subtotal || 0).toFixed(2)}</span></div>
          <div><span>Discount</span><span>Rs ${Number(bill.discount_amount || 0).toFixed(2)}</span></div>
          <div><span>Total</span><span>Rs ${Number(bill.total_amount || 0).toFixed(2)}</span></div>
          <div><span>Paid</span><span>Rs ${Number(bill.paid_amount || 0).toFixed(2)}</span></div>
          <div><span>Credit</span><span>Rs ${Number(bill.credit_amount || 0).toFixed(2)}</span></div>
        </div>

        <div class="invoice-footer">
          <div>Thank you for your business.</div>
        </div>
      </div>
    `;
  };

  const handlePrint = (bill) => {
    const html = buildInvoiceHtml(bill);
    const w = window.open('', '_blank');
    if (!w) {
      alert('Popup blocked. Please allow popups to print.');
      return;
    }
    w.document.write(`
      <html>
        <head>
          <title>Bill ${bill.bill_number || ''}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            .invoice { max-width: 800px; margin: 0 auto; }
            .invoice-header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
            .invoice-brand { display: flex; gap: 12px; align-items: center; }
            .invoice-brand img { width: 60px; height: 60px; object-fit: contain; }
            .company-name { font-size: 18px; font-weight: 700; }
            .company-meta { font-size: 12px; color: #444; }
            .invoice-info { text-align: right; font-size: 12px; }
            .invoice-section { margin: 12px 0 16px; font-size: 12px; }
            .invoice-table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .invoice-table th, .invoice-table td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            .invoice-summary { margin-top: 12px; display: grid; gap: 6px; font-size: 12px; }
            .invoice-summary div { display: flex; justify-content: space-between; }
            .invoice-footer { margin-top: 16px; font-size: 12px; text-align: center; color: #444; }
          </style>
        </head>
        <body>${html}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
  };

  const handleCopyShare = async (bill) => {
    const text = buildShareText(bill);
    try {
      await navigator.clipboard.writeText(text);
      alert('Bill text copied.');
    } catch (err) {
      alert('Failed to copy bill text.');
    }
  };

  const handleCopySms = async (bill) => {
    const text = buildSmsText(bill);
    try {
      await navigator.clipboard.writeText(text);
      alert('SMS text copied.');
    } catch (err) {
      alert('Failed to copy SMS text.');
    }
  };

  const filteredBills = bills.filter(bill =>
    bill.bill_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bill.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bill.customer_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="bills-viewer-loading">Loading bills...</div>;

  return (
    <div className="bills-viewer">
      <div className="bills-viewer-header">
        <h1>📋 Bills History</h1>
        <p>View and manage all created bills</p>
      </div>

      {error && (
        <div className="bills-viewer-error">
          {error}
          <button onClick={fetchBills}>Retry</button>
        </div>
      )}

      <div className="bills-viewer-controls">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search by bill number, customer name, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="refresh-btn" onClick={fetchBills}>
          Refresh
        </button>
      </div>

      {filteredBills.length === 0 ? (
        <div className="bills-viewer-empty">
          <p>No bills found</p>
        </div>
      ) : (
        <div className="bills-viewer-content">
          <div className="bills-list">
            {filteredBills.map(bill => (
              <div
                key={bill.id}
                className={`bill-card ${selectedBill?.id === bill.id ? 'active' : ''}`}
                onClick={() => setSelectedBill(bill)}
              >
                <div className="bill-card-header">
                  <span className="bill-number">{bill.bill_number}</span>
                  <span className="bill-amount">₹{bill.total_amount}</span>
                </div>
                <div className="bill-card-details">
                  <p><strong>{bill.customer_name}</strong></p>
                  <p className="bill-date">
                    {new Date(bill.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="bill-card-status">
                  <span className={`status-badge ${bill.payment_status}`}>
                    {bill.payment_status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {selectedBill && (
            <div className="bill-details">
              <div className="bill-details-header">
                <h2>{selectedBill.bill_number}</h2>
                <div className="bill-details-actions">
                  <button
                    className="action-btn print-btn"
                    onClick={() => handlePrint(selectedBill)}
                    title="Print / Save as PDF"
                  >
                    Print/PDF
                  </button>
                  <button
                    className="action-btn download-btn"
                    onClick={() => downloadBillPDF(selectedBill)}
                    title="Download bill"
                  >
                    <Download size={18} /> Download
                  </button>
                  <button
                    className="action-btn share-btn"
                    onClick={() => handleCopyShare(selectedBill)}
                    title="Copy bill text"
                  >
                    Copy
                  </button>
                  <button
                    className="action-btn sms-btn"
                    onClick={() => handleCopySms(selectedBill)}
                    title="Copy SMS text"
                  >
                    SMS
                  </button>
                  <a
                    className="action-btn whatsapp-btn"
                    href={buildWhatsAppUrl({
                      phone: selectedBill?.customer_phone,
                      text: buildShareText(selectedBill),
                    })}
                    target="_blank"
                    rel="noreferrer"
                    title="Share via WhatsApp"
                  >
                    WhatsApp
                  </a>
                  <button
                    className="action-btn delete-btn"
                    onClick={() => deleteBill(selectedBill.id)}
                    title="Delete bill"
                  >
                    <Trash2 size={18} /> Delete
                  </button>
                </div>
              </div>

              <div className="bill-details-section">
                <h3>Customer Information</h3>
                <div className="detail-row">
                  <label>Name:</label>
                  <span>{selectedBill.customer_name}</span>
                </div>
                <div className="detail-row">
                  <label>Email:</label>
                  <span>{selectedBill.customer_email}</span>
                </div>
                <div className="detail-row">
                  <label>Phone:</label>
                  <span>{selectedBill.customer_phone}</span>
                </div>
                {selectedBill.customer_address && (
                  <div className="detail-row">
                    <label>Address:</label>
                    <span>{selectedBill.customer_address}</span>
                  </div>
                )}
              </div>

              {selectedBill.items && selectedBill.items.length > 0 && (
                <div className="bill-details-section">
                  <h3>Bill Items</h3>
                  <table className="bill-items-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>MRP</th>
                        <th>Discount</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBill.items.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.product_name}</td>
                          <td>{item.qty}</td>
                          <td>{item.unit}</td>
                          <td>₹{item.mrp}</td>
                          <td>₹{item.discount}</td>
                          <td>₹{item.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bill-details-section">
                <h3>Payment Summary</h3>
                <div className="summary-row">
                  <span>Subtotal:</span>
                  <span>₹{selectedBill.subtotal}</span>
                </div>
                <div className="summary-row">
                  <span>Discount:</span>
                  <span>₹{selectedBill.discount_amount}</span>
                </div>
                <div className="summary-row highlight">
                  <span>Total:</span>
                  <span>₹{selectedBill.total_amount}</span>
                </div>
                <div className="summary-row">
                  <span>Paid Amount:</span>
                  <span>₹{selectedBill.paid_amount ?? 0}</span>
                </div>
                <div className="summary-row">
                  <span>Credit Amount:</span>
                  <span>₹{selectedBill.credit_amount ?? 0}</span>
                </div>
                <div className="summary-row">
                  <span>Payment Method:</span>
                  <span>{selectedBill.payment_method}</span>
                </div>
                <div className="summary-row">
                  <span>Payment Status:</span>
                  <span className={`status-badge ${selectedBill.payment_status}`}>
                    {selectedBill.payment_status}
                  </span>
                </div>
                <div className="summary-row">
                  <span>Created:</span>
                  <span>{new Date(selectedBill.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BillsViewer;
