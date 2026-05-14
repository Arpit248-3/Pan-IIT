import api from './api'

export const userService = {
  getAll:  ()              => api.get('/api/users'),
  getById: (id)            => api.get(`/api/users/${id}`),
  create:  (data)          => api.post('/api/users', data),
  update:  (id, data)      => api.put(`/api/users/${id}`, data),
  remove:  (id, requesterId) => api.delete(`/api/users/${id}?requester_id=${requesterId || ''}`),
  changePassword: (data)   => api.put('/api/users/password/change', data),
}
export default userService
