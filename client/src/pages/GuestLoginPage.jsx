// src/pages/GuestLoginPage.jsx
import React, { useState } from 'react';
import { apiPost } from '../services/api';
import { useNavigate }     from 'react-router-dom';
import { useAuth }         from '../context/AuthContext';
import logo                from '../assets/LOL_Logo.jpg';




const GuestLoginPage = () => {
  const { loginAsGuest } = useAuth();
  const navigate         = useNavigate();
  const [name,  setName]  = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    // Fire-and-forget for now — a failed audit write must never lock a volunteer out of the system at the gate.

    try {
      await apiPost('/api/volunteers/sign-in', { name: name.trim() });
    } catch (err) {
      console.error('Guest sign-in not recorded:', err);
    }
    loginAsGuest(name.trim());
    navigate('/guest-home', { replace: true });
  };

  return (
    <div className="page-maroon">
      <div className="card">
        <div className="card-header">
          <img src={logo} alt="Ladles of Love"
               style={{ width: '48px', height: '48px', marginBottom: '6px', background: '#fff', padding: '3px' }} />
          <h1 className="card-header-title">WAREHOUSE SYSTEM</h1>
          <p className="card-header-sub">PROPERTY OF LADLES OF LOVE</p>
        </div>

        <div className="form-body">
          <h2 className="section-title">GUEST SIGN IN</h2>

          {error && <div className="alert-error"><p>⚠ {error.toUpperCase()}</p></div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">FULL NAME</label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                placeholder="e.g. THABO MOKOENA"
                className="form-input"
              />
            </div>

            <button type="submit" className="btn-primary-full">LOGIN</button>
            
            <div>
              <br></br>
            <button type="button" onClick={() => navigate('/login')} className="btn-primary-full">
              ← BACK TO EMPLOYEE SIGN IN
            </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default GuestLoginPage;