import { useState, useEffect, useCallback } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { MdEdit, MdDelete, MdSearch, MdRefresh, MdClose, MdEmail, MdWork, MdBusiness, MdCalendarToday } from 'react-icons/md'
import { toast } from 'sonner'
import userService from '../services/userService'

const ROLES = ['user', 'analyst', 'reviewer', 'safety_officer', 'admin']
const ROLE_LABELS = {
  admin: 'Admin', user: 'User', analyst: 'Analyst',
  reviewer: 'Reviewer', safety_officer: 'Safety Officer',
}
const ROLE_COLORS = {
  admin: '#007BFF', safety_officer: '#10B981',
  analyst: '#F59E0B', reviewer: '#8B5CF6', user: '#94A3B8',
}

function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ── User Detail Drawer ────────────────────────────────────────
function UserDetailDrawer({ user, onClose, onEdit }) {
  if (!user) return null
  const roleColor = ROLE_COLORS[user.role] || '#94A3B8'
  const roleLabel = ROLE_LABELS[user.role] || user.role

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(10,25,47,.4)',
          backdropFilter: 'blur(3px)', zIndex: 400,
        }}
      />
      {/* Drawer panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
        background: 'var(--surface)', boxShadow: '-6px 0 32px rgba(0,0,0,.15)',
        zIndex: 401, display: 'flex', flexDirection: 'column',
        animation: 'slideInRight .25s ease',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>User Details</span>
          <button onClick={onClose} style={{ display: 'flex', color: 'var(--muted)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4,
            transition: 'color .2s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
            <MdClose size={20} />
          </button>
        </div>

        {/* Avatar + Name */}
        <div style={{ padding: '24px 20px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', background: roleColor,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, margin: '0 auto 12px', boxShadow: `0 4px 16px ${roleColor}44`
          }}>
            {getInitials(user.name)}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{user.name}</div>
          <span className={`badge badge-info`}
            style={{ background: roleColor + '22', color: roleColor, border: `1px solid ${roleColor}44` }}>
            {roleLabel}
          </span>
          <div style={{ marginTop: 8 }}>
            <span className={`badge badge-${user.status === 'Active' ? 'success' : 'neutral'}`}>
              {user.status || 'Active'}
            </span>
          </div>
        </div>

        {/* Details */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {[
            { icon: MdEmail,        label: 'Email',       value: user.email },
            { icon: MdWork,         label: 'Role',        value: roleLabel },
            { icon: MdBusiness,     label: 'Department',  value: user.department || 'Pharmacovigilance' },
            { icon: MdCalendarToday,label: 'Last Active', value: user.last_active || 'Never' },
            { icon: MdCalendarToday,label: 'User ID',     value: `#${user.id}` },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 0', borderBottom: '1px solid var(--border)'
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--blue)', flexShrink: 0 }}>
                <Icon size={16} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase',
                  letterSpacing: '.05em', fontWeight: 700, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}
            onClick={onClose}>Close</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => { onClose(); onEdit(user) }}>
            <MdEdit size={14} /> Edit User
          </button>
        </div>
      </div>
    </>
  )
}


// ── Skeleton row ──────────────────────────────────────────────
function SkeletonUserRow() {
  return (
    <tr>
      <td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div className="skeleton" style={{ width: 30, height: 30, borderRadius: '50%' }} />
        <div className="skeleton" style={{ height: 13, width: 120, borderRadius: 4 }} />
      </div></td>
      <td><div className="skeleton" style={{ height: 12, width: 160, borderRadius: 4 }} /></td>
      <td><div className="skeleton" style={{ height: 20, width: 70, borderRadius: 12 }} /></td>
      <td><div className="skeleton" style={{ height: 12, width: 100, borderRadius: 4 }} /></td>
      <td><div className="skeleton" style={{ height: 20, width: 60, borderRadius: 12 }} /></td>
      <td><div className="skeleton" style={{ height: 12, width: 80, borderRadius: 4 }} /></td>
      <td><div className="skeleton" style={{ height: 28, width: 60, borderRadius: 4 }} /></td>
    </tr>
  )
}

export default function UserManagement({ openModal, currentUser }) {
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [roleFilter, setRoleFilter]     = useState('All Roles')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [selectedUser, setSelectedUser] = useState(null)  // for detail drawer

  // ── Fetch from backend ────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await userService.getAll()
      setUsers(data.users || [])
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // ── Role distribution chart ───────────────────────────────
  const roleCounts = users.reduce((acc, u) => {
    const label = ROLE_LABELS[u.role] || u.role
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {})
  const roleData = Object.entries(roleCounts).map(([name, value]) => ({
    name, value, color: ROLE_COLORS[Object.entries(ROLE_LABELS).find(([,v]) => v===name)?.[0]] || '#94A3B8'
  }))

  // ── Filtering ─────────────────────────────────────────────
  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const roleLabel = ROLE_LABELS[u.role] || u.role
    const matchRole = roleFilter === 'All Roles' || roleLabel === roleFilter || u.role === roleFilter
    const matchStatus = statusFilter === 'All Status' || u.status === statusFilter
    return matchSearch && matchRole && matchStatus
  })

  // ── Add User ──────────────────────────────────────────────
  const handleAddUser = () => {
    let formData = { name: '', email: '', role: 'analyst', department: 'Pharmacovigilance', password: '' }
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
            <input className="form-input" type="email" placeholder="user@ayuscout.ai"
              onChange={e => formData.email = e.target.value} />
          </div>
          <div className="form-group">
            <label className="form-label">Password (min 8 chars)</label>
            <input className="form-input" type="password" placeholder="••••••••"
              onChange={e => formData.password = e.target.value} />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select className="form-input" onChange={e => formData.role = e.target.value}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Department</label>
            <input className="form-input" placeholder="e.g. Pharmacovigilance"
              defaultValue="Pharmacovigilance"
              onChange={e => formData.department = e.target.value} />
          </div>
        </>
      ),
      footer: (
        <>
          <button className="btn btn-ghost" onClick={() => openModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={async () => {
            if (!formData.name.trim()) return toast.error('Name is required')
            if (!formData.email.trim()) return toast.error('Email is required')
            if (!formData.password || formData.password.length < 8)
              return toast.error('Password must be at least 8 characters')
            try {
              await userService.create({
                name: formData.name.trim(),
                email: formData.email.trim(),
                password: formData.password,
                role: formData.role,
                department: formData.department,
                requester_id: currentUser?.id,
              })
              toast.success(`User ${formData.name} created successfully`)
              openModal(null)
              fetchUsers()
            } catch { /* toasted by api.js */ }
          }}>Add User</button>
        </>
      )
    })
  }

  // ── Edit User ─────────────────────────────────────────────
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
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Department</label>
            <input className="form-input" defaultValue={user.department}
              onChange={e => formData.department = e.target.value} />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-input" defaultValue={user.status}
              onChange={e => formData.status = e.target.value}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>
        </>
      ),
      footer: (
        <>
          <button className="btn btn-ghost" onClick={() => openModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={async () => {
            try {
              await userService.update(user.id, {
                name: formData.name, email: formData.email,
                role: formData.role, department: formData.department,
                status: formData.status, requester_id: currentUser?.id,
              })
              toast.success('User updated successfully')
              openModal(null)
              fetchUsers()
            } catch { /* toasted by api.js */ }
          }}>Save Changes</button>
        </>
      )
    })
  }

  // ── Delete User (soft-delete) ─────────────────────────────
  const handleDelete = (user) => {
    openModal({
      title: 'Deactivate User',
      children: (
        <div style={{ fontSize: 14, lineHeight: 1.7 }}>
          Are you sure you want to deactivate <strong>{user.name}</strong>?<br />
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            The user will be set to Inactive and removed from the active list.
            All audit logs and data will be preserved.
          </span>
        </div>
      ),
      footer: (
        <>
          <button className="btn btn-ghost" onClick={() => openModal(null)}>Cancel</button>
          <button className="btn btn-primary" style={{ background: 'var(--danger)' }}
            onClick={async () => {
              try {
                await userService.remove(user.id, currentUser?.id)
                toast.success(`${user.name} has been deactivated`)
                openModal(null)
                fetchUsers()
              } catch { /* toasted by api.js */ }
            }}>Deactivate</button>
        </>
      )
    })
  }

  const activeCount = users.filter(u => u.status === 'Active').length

  return (
    <>
      <div className="filter-bar">
        <select className="filter-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option>All Roles</option>
          {Object.values(ROLE_LABELS).map(r => <option key={r}>{r}</option>)}
        </select>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option>All Status</option>
          <option>Active</option>
          <option>Inactive</option>
        </select>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <MdSearch size={16} style={{ position: 'absolute', left: 10, color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="form-input" style={{ paddingLeft: 32, maxWidth: 220, fontSize: 13 }}
            placeholder="Search users..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchUsers} title="Refresh"
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <MdRefresh size={16} className={loading ? 'spin' : ''} />
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleAddUser}>+ Add User</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: 24 }}>
        {/* ── User Table ── */}
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
            {loading ? (
              <table><tbody>
                {[1,2,3,4].map(i => <SkeletonUserRow key={i} />)}
              </tbody></table>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
                {users.length === 0 ? '👥 No users in the system yet.' : 'No users match the current filter.'}
              </div>
            ) : (
              <table>
                <thead><tr>
                  <th>User</th><th>Email</th><th>Role</th>
                  <th>Dept</th><th>Status</th><th>Last Active</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {filtered.map(u => {
                    const roleColor = ROLE_COLORS[u.role] || '#94A3B8'
                    return (
                      <tr key={u.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 30, height: 30, borderRadius: '50%',
                              background: roleColor, color: '#fff', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              {getInitials(u.name)}
                            </div>
                            {/* Clickable name → opens detail drawer */}
                            <button
                              onClick={() => setSelectedUser(u)}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontWeight: 600, fontSize: 13, color: 'var(--blue)',
                                padding: 0, textAlign: 'left', textDecoration: 'underline',
                                textDecorationColor: 'transparent', transition: 'all .15s',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.textDecorationColor = 'var(--blue)'
                                e.currentTarget.style.color = 'var(--blue-hover)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.textDecorationColor = 'transparent'
                                e.currentTarget.style.color = 'var(--blue)'
                              }}
                              title="Click to view user details"
                            >
                              {u.name}
                            </button>
                          </div>
                        </td>
                        <td style={{ fontSize: 12 }}>{u.email}</td>
                        <td><span className="badge badge-info">{ROLE_LABELS[u.role] || u.role}</span></td>
                        <td style={{ fontSize: 12 }}>{u.department}</td>
                        <td><span className={`badge badge-${u.status === 'Active' ? 'success' : 'neutral'}`}>{u.status}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{u.last_active || 'Never'}</td>
                        <td>
                          <button className="btn btn-ghost btn-sm" title="Edit user"
                            onClick={() => handleEdit(u)}
                            style={{ display: 'inline-flex', alignItems: 'center' }}>
                            <MdEdit size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Deactivate user"
                            onClick={() => handleDelete(u)}
                            style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--danger)' }}>
                            <MdDelete size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Role Distribution Chart ── */}
        <div className="card">
          <div className="card-header"><span className="card-title">Role Distribution</span></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {roleData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={roleData} cx="50%" cy="50%" innerRadius={45} outerRadius={75}
                      dataKey="value" stroke="none">
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
                        <span>{r.name}</span><span style={{ fontWeight: 600 }}>{r.value}</span>
                      </div>
                      <div className="progress">
                        <div className="progress-fill"
                          style={{ width: `${(r.value / Math.max(users.length, 1)) * 100}%`, background: r.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ padding: 32, color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>
                No users to display
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── User Detail Drawer ── */}
      {selectedUser && (
        <UserDetailDrawer
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onEdit={(u) => { setSelectedUser(null); handleEdit(u) }}
        />
      )}
    </>
  )
}
