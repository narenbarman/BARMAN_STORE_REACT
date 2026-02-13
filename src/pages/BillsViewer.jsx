import React, { useState, useEffect } from 'react';
import { Download, Trash2, Search } from 'lucide-react';
import { billingApi } from '../services/api';
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
      const response = await fetch(`http://localhost:5000/api/bills/${billId}`, {
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
                    className="action-btn download-btn"
                    onClick={() => downloadBillPDF(selectedBill)}
                    title="Download bill"
                  >
                    <Download size={18} /> Download
                  </button>
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
