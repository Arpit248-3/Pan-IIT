import { useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { MdEdit, MdDelete, MdSearch } from 'react-icons/md'

const INITIAL_USERS = [
  { id: 1, name: 'Dr. Rajesh Kumar',  init: 'RK', email: 'rajesh.k@signalrx.ai',  role: 'Admin',          dept: 'Pharmacovigilance',  stat: 'Active',   last: 'Just now'   },
  { id: 2, name: 'Dr. Priya Sharma',  init: 'PS', email: 'priya.s@signalrx.ai',   role: 'Safety Officer', dept: 'Drug Safety',        stat: 'Active',   last: '5 min ago'  },
  { id: 3, name: 'Dr. Anita Menon',   init: 'AM', email: 'anita.m@signalrx.ai',   role: 'Analyst',        dept: 'Social Listening',   stat: 'Active',   last: '1 hour ago' },
  { id: 4, name: 'Dr. Vikram Patel',  init: 'VP', email: 'vikram.p@signalrx.ai',  role: 'Reviewer',       dept: 'Regulatory',         stat: 'Active',   last: '3 hours ago'},
  { id: 5, name: 'Dr. Sunita Rao',    init: 'SR', email: 'sunita.r@signalrx.ai',  role: 'Safety Officer', dept: 'Drug Safety',        stat: 'Inactive', last: '5 days ago' },
  { id: 6, name: 'Dr. Amit Gupta',    init: 'AG', email: 'amit.g@signalrx.ai',    role: 'Analyst',        dept: 'Epidemiology',       stat: 'Active',   last: '1 day ago'  },
]

const ROLES = ['Analyst', 'Safety Officer', 'Admin', 'Reviewer']
const ROLE_COLORS = { Admin: '#007BFF', 'Safety Officer': '#10B981', Analyst: '#F59E0B', Reviewer: '#8B5CF6' }

function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function UserManagement({ openModal }) {
  const [users, setUsers] = useState(INITIAL_USERS)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All Roles')
  const [statusFilter, setStatusFilter] = useState('All Status')

  // ── Role distribution for chart (derived from live users) ────
  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1
    return acc
  }, {})
  const roleData = Object.entries(roleCounts).map(([name, value]) => ({
    name, value, color: ROLE_COLORS[name] || '#94A3B8'
  }))

  // ── Filtering ────────────────────────────────────────────────
  const filtered = users.filter(u => {
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) &&
        !u.email.toLowerCase().includes(search.toLowerCase())) return false
    if (roleFilter !== 'All Roles' && u.role !== roleFilter) return false
    if (statusFilter !== 'All Status' && u.stat !== statusFilter) return false
    return true
  })

  // ── Add User ─────────────────────────────────────────────────
  const handleAddUser = () => {
    let formData = { name: '', email: '', role: 'Analyst', dept: '' }

    openModal({
      title: 'Add New User',
      children: (
        <>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input className="form-input" placeholder="e.g. Dr. Aisha Patel"
              onChange={e => formData.name = e.target.value} />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="user@signalrx.ai"
              onChange={e => formData.email = e.target.value} />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select className="form-input" onChange={e => formData.role = e.target.value}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Department</label>
            <input className="form-input" placeholder="e.g. Pharmacovigilance"
              onChange={e => formData.dept = e.target.value} />
          </div>
        </>
      ),
      footer: (
        <>
          <button className="btn btn-ghost" onClick={() => openModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => {
            if (!formData.name.trim()) return alert('Name is required')
            const newUser = {
              id: Date.now(),
              name: formData.name.trim(),
              init: getInitials(formData.name),
              email: formData.email.trim() || `user${Date.now()}@signalrx.ai`,
              role: formData.role,
              dept: formData.dept.trim() || 'Pharmacovigilance',
              stat: 'Active',
              last: 'Just now'
            }
            setUsers(prev => [newUser, ...prev])
            openModal(null)
          }}>Add User</button>
        </>
      )
    })
  }

  // ── Edit User ────────────────────────────────────────────────
  const handleEdit = (user) => {
    let formData = { ...user }

    openModal({
      title: `Edit: ${user.name}`,
      children: (
        <>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input className="form-input" defaultValue={user.name}
              onChange={e => formData.name = e.target.value} />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" defaultValue={user.email}
              onChange={e => formData.email = e.target.value} />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select className="form-input" defaultValue={user.role}
              onChange={e => formData.role = e.target.value}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Department</label>
            <input className="form-input" defaultValue={user.dept}
              onChange={e => formData.dept = e.target.value} />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-input" defaultValue={user.stat}
              onChange={e => formData.stat = e.target.value}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>
        </>
      ),
      footer: (
        <>
          <button className="btn btn-ghost" onClick={() => openModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => {
            setUsers(prev => prev.map(u => u.id === user.id
              ? { ...u, ...formData, init: getInitials(formData.name || u.name) }
              : u
            ))
            openModal(null)
          }}>Save Changes</button>
        </>
      )
    })
  }

  // ── Delete User ──────────────────────────────────────────────
  const handleDelete = (user) => {
    openModal({
      title: 'Remove User',
      children: (
        <div style={{ fontSize: 14, lineHeight: 1.7 }}>
          Are you sure you want to remove <strong>{user.name}</strong>?
          <br />
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>This action cannot be undone.</span>
        </div>
      ),
      footer: (
        <>
          <button className="btn btn-ghost" onClick={() => openModal(null)}>Cancel</button>
          <button className="btn btn-primary" style={{ background: 'var(--danger)' }} onClick={() => {
            setUsers(prev => prev.filter(u => u.id !== user.id))
            openModal(null)
          }}>Remove</button>
        </>
      )
    })
  }

  const activeCount = users.filter(u => u.stat === 'Active').length

  return (
    <>
      <div className="filter-bar">
        <select className="filter-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option>All Roles</option>
          {ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option>All Status</option>
          <option>Active</option>
          <option>Inactive</option>
        </select>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <MdSearch size={16} style={{ position: 'absolute', left: 10, color: 'var(--muted)', pointerEvents: 'none' }} />
          <input
            className="form-input"
            style={{ paddingLeft: 32, maxWidth: 220, fontSize: 13 }}
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleAddUser}>+ Add User</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: 24 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Team Members</span>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>
              {filtered.length} of {users.length} users
              &nbsp;·&nbsp;
              <span style={{ color: 'var(--success)' }}>{activeCount} active</span>
            </span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>No users match the current filter.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Dept</th>
                    <th>Status</th>
                    <th>Last Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: ROLE_COLORS[u.role] || 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {u.init}
                          </div>
                          <strong>{u.name}</strong>
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>{u.email}</td>
                      <td><span className="badge badge-info">{u.role}</span></td>
                      <td style={{ fontSize: 12 }}>{u.dept}</td>
                      <td><span className={`badge badge-${u.stat === 'Active' ? 'success' : 'neutral'}`}>{u.stat}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{u.last}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" title="Edit user" onClick={() => handleEdit(u)}
                          style={{ display: 'inline-flex', alignItems: 'center' }}>
                          <MdEdit size={14} />
                        </button>
                        <button className="btn btn-ghost btn-sm" title="Remove user" onClick={() => handleDelete(u)}
                          style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--danger)' }}>
                          <MdDelete size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Role Distribution — live from state */}
        <div className="card">
          <div className="card-header"><span className="card-title">Role Distribution</span></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={roleData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" stroke="none">
                  {roleData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 8 }}>
              {roleData.map(r => (
                <span key={r.name} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, display: 'inline-block' }} />
                  {r.name} ({r.value})
                </span>
              ))}
            </div>
            <div style={{ marginTop: 16, width: '100%' }}>
              {roleData.map(r => (
                <div key={r.name} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>{r.name}</span>
                    <span style={{ fontWeight: 600 }}>{r.value}</span>
                  </div>
                  <div className="progress">
                    <div className="progress-fill" style={{ width: `${(r.value / users.length) * 100}%`, background: r.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
