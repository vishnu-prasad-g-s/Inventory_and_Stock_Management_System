'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const stats = [
  { label: 'Total Products', value: '0', icon: '📦', color: '#6366f1' },
  { label: 'Warehouses', value: '0', icon: '🏭', color: '#06b6d4' },
  { label: 'Low Stock Alerts', value: '0', icon: '⚠️', color: '#f59e0b' },
  { label: "Today's Sales", value: '₹0', icon: '💰', color: '#10b981' },
]

const quickLinks = [
  { href: '/products', label: 'Products', icon: '📦', desc: 'Manage your product catalog' },
  { href: '/inventory', label: 'Inventory', icon: '🗂️', desc: 'Track stock levels & movements' },
  { href: '/sales', label: 'Sales', icon: '🛒', desc: 'Orders, invoices & POS' },
  { href: '/purchasing', label: 'Purchasing', icon: '🚚', desc: 'Purchase orders & GRNs' },
  { href: '/reports', label: 'Reports', icon: '📊', desc: 'Analytics & insights' },
  { href: '/settings', label: 'Settings', icon: '⚙️', desc: 'Configure your workspace' },
]

export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 2rem', borderBottom: '1px solid #334155',
        background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.75rem' }}>🧭</span>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, background: 'linear-gradient(90deg,#6366f1,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            StockPilot
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <a href="/api/health" style={pillStyle('#6366f1')}>API Health</a>
          <a href="http://localhost:8025" target="_blank" rel="noreferrer" style={pillStyle('#06b6d4')}>Mailpit UI</a>
          <a href="http://localhost:9001" target="_blank" rel="noreferrer" style={pillStyle('#10b981')}>MinIO Console</a>
        </div>
      </nav>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '3rem 2rem' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '4rem', opacity: mounted ? 1 : 0, transition: 'opacity 0.6s ease' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🧭</div>
          <h1 style={{ fontSize: '3rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '1rem' }}>
            Welcome to{' '}
            <span style={{ background: 'linear-gradient(90deg,#6366f1,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              StockPilot
            </span>
          </h1>
          <p style={{ fontSize: '1.2rem', color: '#94a3b8', maxWidth: '600px', margin: '0 auto 2rem' }}>
            A complete Inventory &amp; Stock Management System. Manage products, warehouses, sales, purchasing, and analytics all in one place.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <span style={badgeStyle('#10b981')}>✅ Database Connected</span>
            <span style={badgeStyle('#6366f1')}>✅ Docker Running</span>
            <span style={badgeStyle('#06b6d4')}>✅ API Ready</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
          {stats.map((s) => (
            <div key={s.label} style={cardStyle}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{s.icon}</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.25rem' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', color: '#e2e8f0' }}>Quick Navigation</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '3rem' }}>
          {quickLinks.map((l) => (
            <div key={l.href} style={{ ...cardStyle, cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 20px 40px rgba(99,102,241,0.2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{l.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem' }}>{l.label}</div>
              <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>{l.desc}</div>
            </div>
          ))}
        </div>

        {/* API Endpoints info */}
        <div style={cardStyle}>
          <h3 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem', color: '#e2e8f0' }}>📡 API Endpoints</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            {[
              { path: '/api/health', label: 'Health Check' },
              { path: '/api/products', label: 'Products' },
              { path: '/api/inventory', label: 'Inventory' },
              { path: '/api/sales/orders', label: 'Sales Orders' },
              { path: '/api/purchasing/orders', label: 'Purchase Orders' },
              { path: '/api/reports/dashboard', label: 'Dashboard' },
            ].map((ep) => (
              <a key={ep.path} href={ep.path}
                style={{ display: 'block', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '0.75rem 1rem', color: '#6366f1', fontFamily: 'monospace', fontSize: '0.8rem', transition: 'border-color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#334155')}
              >
                <div style={{ color: '#94a3b8', fontFamily: 'inherit', marginBottom: '0.25rem', fontSize: '0.75rem' }}>{ep.label}</div>
                {ep.path}
              </a>
            ))}
          </div>
        </div>
      </main>

      <footer style={{ textAlign: 'center', padding: '2rem', color: '#475569', borderTop: '1px solid #1e293b', marginTop: '3rem' }}>
        StockPilot v0.1.0 — Built with Next.js, Prisma & PostgreSQL
      </footer>
    </div>
  )
}

function pillStyle(color: string) {
  return {
    padding: '0.4rem 1rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600,
    background: `${color}22`, border: `1px solid ${color}55`, color,
  } as React.CSSProperties
}

function badgeStyle(color: string) {
  return {
    padding: '0.5rem 1.25rem', borderRadius: '999px', fontSize: '0.9rem', fontWeight: 600,
    background: `${color}1a`, border: `1px solid ${color}44`, color,
  } as React.CSSProperties
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(30,41,59,0.8)',
  border: '1px solid #334155',
  borderRadius: '16px',
  padding: '1.5rem',
  backdropFilter: 'blur(8px)',
}
