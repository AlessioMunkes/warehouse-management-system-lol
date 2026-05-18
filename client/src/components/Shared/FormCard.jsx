import React from 'react';

const FormCard = ({ title, children, width = '450px' }) => {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: width,
        background: 'rgba(255,255,255,0.07)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderRadius: '20px',
        border: '1px solid rgba(255,255,255,0.14)',
        padding: '32px 28px 28px',
        boxShadow: '0 4px 60px rgba(0, 0, 0, 0.55)',
        color: '#fff',
        boxSizing: 'border-box',
      }}
    >
      {title && (
        <>
          <h2
            style={{
              fontSize: '24px',
              fontWeight: '700',
              marginBottom: '8px',
              textAlign: 'center',
              color: '#fff',
            }}
          >
            {title}
          </h2>
          <div
            style={{
              height: '1px',
              background: 'rgba(255,255,255,0.14)',
              marginBottom: '22px',
            }}
          />
        </>
      )}
      {children}
    </div>
  );
};

export default FormCard;
