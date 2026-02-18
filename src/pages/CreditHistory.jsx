import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, DollarSign, CreditCard, RefreshCw, Printer, Upload, FileText, Eye, Download } from 'lucide-react';
import { creditApi, usersApi } from '../services/api';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as info from './info';
import './CreditHistory.css';

// Currency formatter with Indian Rupee symbol
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

// Currency formatter with conditional color styling
const formatCurrencyColored = (amount) => {
  const formatted = formatCurrency(Math.abs(amount));
  const isPositive = amount >= 0;
  return <span className={isPositive ? 'amount-positive' : 'amount-negative'}>{formatted}</span>;
};

// Format date for display
const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

function CreditHistory({ user }) {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [creditHistory, setCreditHistory] = useState([]);
  const [balance, setBalance] = useState(0);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    type: 'given',
    amount: '',
    description: '',
    reference: '',
    transactionDate: new Date().toISOString().split('T')[0],
    imagePath: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  // New: report states
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportText, setReportText] = useState('');
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/');
      return;
    }
    fetchCreditData();
  }, [user, userId, navigate]);

  const fetchCreditData = async () => {
    try {
      setLoading(true);
      const [historyData, balanceData, customerData] = await Promise.all([
        creditApi.getHistory(userId),
        creditApi.getBalance(userId),
        usersApi.getById(userId)
      ]);
      setCreditHistory(historyData);
      setBalance(balanceData.balance);
      setCustomer(customerData);
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      setError(err.message || 'Failed to load credit history');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('invoice', file);

    try {
      const response = await fetch('/api/upload/invoice', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        setNewTransaction({ ...newTransaction, imagePath: data.imagePath });
        setSuccess('Invoice uploaded successfully');
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!newTransaction.amount || parseFloat(newTransaction.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (!newTransaction.transactionDate) {
      setError('Please select a transaction date');
      return;
    }

    if (!newTransaction.description.trim()) {
      setError('Please enter a description');
      return;
    }

    try {
      const result = await creditApi.addTransaction(userId, {
        ...newTransaction,
        amount: parseFloat(newTransaction.amount),
        created_by: user?.id
      });
      setSuccess('Transaction added successfully');
      setNewTransaction({
        type: 'given',
        amount: '',
        description: '',
        reference: '',
        transactionDate: new Date().toISOString().split('T')[0],
        imagePath: ''
      });
      setShowAddModal(false);
      fetchCreditData();
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      setError(err.message || 'Failed to add transaction');
    }
  };

  const handlePrintInvoice = (transaction) => {
    setSelectedTransaction(transaction);
    setShowInvoiceModal(true);
  };

  const printInvoice = () => {
    window.print();
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'given': return <DollarSign size={16} className="type-icon given" />;
      case 'payment': return <RefreshCw size={16} className="type-icon payment" />;
      default: return <DollarSign size={16} />;
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'given': return 'Given';
      case 'payment': return 'Payment';
      default: return type;
    }
  };

  // Helper: normalize phone for WhatsApp link (assumes India if 10 digits)
  const normalizePhoneForWhatsApp = (phone) => {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) {
      return `91${digits}`; // assume India
    }
    return digits;
  };

  // Build a readable report text for a set of transactions
  const buildCreditReport = (transactions, from, to) => {
    const lines = [];
    lines.push(`Credit Report for: ${customer?.name || 'Customer'}`);
    lines.push(`Date Range: ${from} to ${to}`);
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push('');
    if (!transactions || transactions.length === 0) {
      lines.push('No transactions in this range.');
    } else {
      lines.push('Transactions:');
      let totalGiven = 0;
      let totalPayment = 0;
      transactions.forEach((t) => {
        const date = new Date(t.created_at).toLocaleDateString('en-IN');
        const typeLabel = getTypeLabel(t.type);
        const amount = Number(t.amount) || 0;
        if (t.type === 'given') totalGiven += amount;
        else if (t.type === 'payment') totalPayment += amount;
        const desc = t.reference ? `${t.description || ''} (${t.reference})`.trim() : (t.description || '-');
        lines.push(`- ${date} | ${typeLabel} | ${formatCurrency(amount)} | Balance: ${formatCurrency(Number(t.balance || 0))}`);
        lines.push(`  Desc: ${desc}`);
      });
      lines.push('');
      lines.push(`Total Given: ${formatCurrency(totalGiven)}`);
      lines.push(`Total Payment: ${formatCurrency(totalPayment)}`);
      lines.push(`Net Change: ${formatCurrency(totalGiven - totalPayment)}`);
      lines.push(`Current Balance (end): ${formatCurrency(parseFloat(transactions[transactions.length - 1].balance || 0))}`);
    }
    return lines.join('\n');
  };

  // Generate report for selected date range (client-side filter)
  const handleGenerateReport = () => {
    if (!fromDate || !toDate) {
      setError('Please select both From and To dates for the report.');
      return;
    }
    setError('');
    setSuccess('');
    const from = new Date(fromDate);
    const to = new Date(toDate);
    // normalize to include entire day for 'to'
    to.setHours(23, 59, 59, 999);

    const filtered = creditHistory.filter((t) => {
      const d = new Date(t.created_at);
      return d >= from && d <= to;
    }).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const report = buildCreditReport(filtered, fromDate, toDate);
    setReportText(report);
    setShowReport(true);
  };

  const handleCopyReport = async () => {
    if (!reportText) return;
    try {
      await navigator.clipboard.writeText(reportText);
      setSuccess('Report copied to clipboard');
    } catch (err) {
      setError('Failed to copy report');
    }
  };

  const handleSendWhatsApp = () => {
    if (!reportText) return;
    // Prefer customer's phone; otherwise link opens basic wa.me page
    const phone = normalizePhoneForWhatsApp(customer?.phone);
    const encoded = encodeURIComponent(reportText);
    const href = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(href, '_blank', 'noopener noreferrer');
  };

  // Generate PDF report with company branding
  const generatePDFReport = () => {
    if (!fromDate || !toDate) {
      setError('Please select both From and To dates for the report.');
      return;
    }
    setError('');
    setSuccess('');

    const from = new Date(fromDate);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);

    const filtered = creditHistory.filter((t) => {
      const d = new Date(t.created_at);
      return d >= from && d <= to;
    }).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Create PDF document
    const doc = new jsPDF();
    
    // Colors
    const primaryColor = [41, 128, 185]; // Blue
    const secondaryColor = [52, 73, 94]; // Dark gray
    const accentColor = [39, 174, 96]; // Green
    
    // Header background
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 45, 'F');
    
    // Company name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(info.TITLE || 'BARMAN STORE', 105, 18, { align: 'center' });
    
    // Company subtitle
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(info.SUB_TITLE || 'Quality Groceries & Everyday Essentials', 105, 28, { align: 'center' });
    
    // Contact info
    doc.setFontSize(9);
    const contactText = `${info.EMAIL || ''} | ${info.CONTACT || ''}`;
    doc.text(contactText, 105, 38, { align: 'center' });
    
    // Report title
    doc.setTextColor(...secondaryColor);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Credit Report', 105, 55, { align: 'center' });
    
    // Customer info box
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(14, 62, 182, 28, 3, 3, 'FD');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...secondaryColor);
    doc.text('Customer Details', 20, 72);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Name: ${customer?.name || 'N/A'}`, 20, 80);
    doc.text(`Phone: ${customer?.phone || 'N/A'}`, 100, 80);
    doc.text(`Email: ${customer?.email || 'N/A'}`, 20, 86);
    
    // Date range
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Period: ${fromDate} to ${toDate}`, 100, 86);
    
    // Transactions table
    if (filtered.length > 0) {
      const tableData = filtered.map((t, index) => [
        new Date(t.created_at).toLocaleDateString('en-IN'),
        getTypeLabel(t.type),
        t.reference || '-',
        { content: formatCurrency(Number(t.amount)), styles: { halign: 'right' } },
        { content: formatCurrency(Number(t.balance)), styles: { halign: 'right' } },
        t.description || '-'
      ]);
      
      doc.autoTable({
        startY: 95,
        head: [['Date', 'Type', 'Reference', 'Amount', 'Balance', 'Description']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9
        },
        bodyStyles: {
          fontSize: 8,
          cellPadding: 3
        },
        alternateRowStyles: {
          fillColor: [248, 249, 250]
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 20 },
          2: { cellWidth: 25 },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 30, halign: 'right' },
          5: { cellWidth: 'auto' }
        },
        margin: { left: 14, right: 14 }
      });
      
      // Summary section
      const finalY = doc.lastAutoTable.finalY + 10;
      
      let totalGiven = 0;
      let totalPayment = 0;
      filtered.forEach((t) => {
        const amount = Number(t.amount) || 0;
        if (t.type === 'given') totalGiven += amount;
        else if (t.type === 'payment') totalPayment += amount;
      });
      
      // Summary box
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(14, finalY, 182, 35, 3, 3, 'F');
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...secondaryColor);
      doc.text('Summary', 20, finalY + 10);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      
      const summaryY = finalY + 18;
      doc.text(`Total Credit Given: ${formatCurrency(totalGiven)}`, 20, summaryY);
      doc.text(`Total Payments Received: ${formatCurrency(totalPayment)}`, 20, summaryY + 7);
      doc.text(`Net Change: ${formatCurrency(totalGiven - totalPayment)}`, 20, summaryY + 14);
      
      // Current balance on right side
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Current Balance:', 130, summaryY + 7);
      doc.setTextColor(balance >= 0 ? accentColor[0] : 231, balance >= 0 ? accentColor[1] : 76, balance >= 0 ? accentColor[2] : 60);
      doc.setFontSize(12);
      doc.text(formatCurrency(balance), 130, summaryY + 14);
    } else {
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text('No transactions found in the selected date range.', 105, 110, { align: 'center' });
    }
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Generated on ${new Date().toLocaleString('en-IN')} | Page ${i} of ${pageCount}`,
        105,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }
    
    // Save the PDF
    const fileName = `Credit_Report_${customer?.name?.replace(/\s+/g, '_') || 'Customer'}_${fromDate}_to_${toDate}.pdf`;
    doc.save(fileName);
    setSuccess('PDF report downloaded successfully!');
  };

  if (loading) {
    return (
      <div className="credit-history-page">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="credit-history-page">
      <div className="page-header">
        <Link to="/admin" className="back-link">
          <ArrowLeft size={20} /> Back to Admin
        </Link>
        <div className="header-content">
          <h1>Credit History</h1>
          {customer && <p className="customer-name">{customer.name}</p>}
        </div>
        <div className="balance-card">
          <span className="balance-label">Current Balance</span>
          <span className={`balance-amount ${balance >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrencyColored(balance)}
          </span>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="actions-bar">
        <button className="admin-btn primary" onClick={() => setShowAddModal(true)}>
          <Plus size={20} /> Add Transaction
        </button>

        {/* New: Date range controls and generate report */}
        
      </div>

      <div className="credit-table-container">
        {creditHistory.length === 0 ? (
          <div className="empty-state">
            <p>No credit history found for this customer.</p>
            <p>Click "Add Transaction" to record a transaction.</p>
          </div>
        ) : (
          <table className="credit-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice #</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Balance</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {creditHistory.map((transaction) => {
                const descriptionWithRef = transaction.reference 
                  ? `${transaction.description || ''} (${transaction.reference})`.trim()
                  : transaction.description || '-';
                return (
                <tr key={transaction.id}>
                  <td>{formatDate(transaction.created_at)}</td>
                  <td className="invoice-number">{transaction.invoice_number || '-'}</td>
                  <td>
                    {getTypeIcon(transaction.type)}
                    <span>{getTypeLabel(transaction.type)}</span>
                  </td>
                  <td className={transaction.type === 'payment' ? 'payment-amount' : 'given-amount'}>
                    {formatCurrencyColored(transaction.type === 'payment' ? -parseFloat(transaction.amount) : parseFloat(transaction.amount))}
                  </td>
                  <td>{formatCurrencyColored(parseFloat(transaction.balance))}</td>
                  <td>{descriptionWithRef}</td>
                  <td className="actions-cell">
                    {transaction.image_path && (
                      <a 
                        href={transaction.image_path}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="action-icon view"
                        title="View Invoice"
                      >
                        <Eye size={16} />
                      </a>
                    )}
                    <button 
                      className="action-icon print"
                      onClick={() => handlePrintInvoice(transaction)}
                      title="Print Invoice"
                    >
                      <Printer size={16} />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
              )}
         <div className="report-controls">
            <label> From:<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label> To:<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
            <button className="admin-btn" onClick={handleGenerateReport} title="Generate credit report for date range">
            Generate Report
            </button>
         </div>
      </div>

      {/* Report preview / share box */}
      {showReport && (
        <div className="report-box">
          <div className="report-header">
            <strong>Credit Report {customer?.name ? `- ${customer.name}` : ''}</strong>
          </div>
          <textarea className="report-text" readOnly value={reportText} />
          <div className="report-actions">
            <button className="report-btn" onClick={handleCopyReport}>Copy</button>
            <button className="report-btn whatsapp" onClick={handleSendWhatsApp}>WhatsApp</button>
            <button className="report-btn pdf" onClick={generatePDFReport}><Download size={14} /> PDF</button>
            <button className="report-btn" onClick={() => setShowReport(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content fade-in-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Payment Entry</h2>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form onSubmit={handleAddTransaction}>
              <div className="form-group">
                <label>Transaction Type</label>
                <select
                  value={newTransaction.type}
                  onChange={(e) => setNewTransaction({ ...newTransaction, type: e.target.value })}
                >
                  <option value="given">Given (Add to balance)</option>
                  <option value="payment">Payment (Reduce balance)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={newTransaction.amount}
                  onChange={(e) => setNewTransaction({ ...newTransaction, amount: e.target.value })}
                  placeholder="Enter amount"
                  required
                />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={newTransaction.transactionDate}
                  onChange={(e) => setNewTransaction({ ...newTransaction, transactionDate: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description *</label>
                <input
                  type="text"
                  value={newTransaction.description}
                  onChange={(e) => setNewTransaction({ ...newTransaction, description: e.target.value })}
                  placeholder="Enter description"
                  required
                />
              </div>
              <div className="form-group">
                <label>Reference</label>
                <input
                  type="text"
                  value={newTransaction.reference}
                  onChange={(e) => setNewTransaction({ ...newTransaction, reference: e.target.value })}
                  placeholder="Reference number (optional)"
                />
              </div>
              <div className="form-group">
                <label>Upload Invoice/Bill</label>
                <div className="file-upload-area">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*,.pdf"
                    style={{ display: 'none' }}
                  />
                  <button 
                    type="button"
                    className="upload-btn"
                    onClick={() => fileInputRef.current.click()}
                    disabled={uploading}
                  >
                    <Upload size={16} />
                    {uploading ? 'Uploading...' : 'Choose File'}
                  </button>
                  {newTransaction.imagePath && (
                    <span className="uploaded-file">
                      <FileText size={14} /> Invoice uploaded
                    </span>
                  )}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Add Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && selectedTransaction && (
        <div className="modal-overlay invoice-modal-overlay" onClick={() => setShowInvoiceModal(false)}>
          <div className="invoice-template fade-in-up" onClick={(e) => e.stopPropagation()}>
            <div className="invoice-header">
              <h1>INVOICE</h1>
              <div className="company-details">
                <h3>Barman Store</h3>
                <p>Quality Groceries & Everyday Essentials</p>
                <p>Email: info@barmanstore.com</p>
              </div>
            </div>
            
            <div className="invoice-details">
              <div className="invoice-info">
                <p><strong>Invoice #:</strong> {selectedTransaction.invoice_number}</p>
                <p><strong>Date:</strong> {formatDate(selectedTransaction.created_at)}</p>
              </div>
              <div className="customer-info">
                <h4>Bill To:</h4>
                <p><strong>{customer?.name}</strong></p>
                <p>{customer?.email || 'No email'}</p>
                <p>{customer?.phone || 'No phone'}</p>
                {customer?.address && <p>{customer.address}</p>}
              </div>
            </div>

            <table className="invoice-items">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{selectedTransaction.description}</td>
                  <td>{getTypeLabel(selectedTransaction.type)}</td>
                  <td>{formatCurrencyColored(parseFloat(selectedTransaction.amount))}</td>
                </tr>
              </tbody>
            </table>

            <div className="invoice-summary">
              <div className="summary-row">
                <span>Previous Balance:</span>
                <span>{formatCurrencyColored(parseFloat(selectedTransaction.balance) + parseFloat(selectedTransaction.amount))}</span>
              </div>
              <div className="summary-row">
                <span>Amount:</span>
                <span>{formatCurrencyColored(parseFloat(selectedTransaction.amount))}</span>
              </div>
              <div className="summary-row total">
                <span>Current Balance:</span>
                <span>{formatCurrencyColored(parseFloat(selectedTransaction.balance))}</span>
              </div>
            </div>

            {selectedTransaction.reference && (
              <div className="invoice-footer">
                <p><strong>Reference:</strong> {selectedTransaction.reference}</p>
              </div>
            )}

            <div className="invoice-actions no-print">
              <button className="admin-btn" onClick={printInvoice}>
                <Printer size={16} /> Print Invoice
              </button>
              <button className="admin-btn secondary" onClick={() => setShowInvoiceModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreditHistory;
