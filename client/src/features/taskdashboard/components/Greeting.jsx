// src/components/home/Greeting.jsx
export function Greeting({ name }) {
  return (
    <div className="greeting">
      <h1 className="greeting__title">Hi {name}!</h1>
      <p className="greeting__subtitle">What are you working on today?</p>
    </div>
  );
}