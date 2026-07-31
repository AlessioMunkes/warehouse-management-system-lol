// src/features/InventoryManagement/components/Button.jsx
const VARIANT_CLASS = {
  primary: "btn-primary",
  primaryFull: "btn-primary-full",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  link: "btn-link",
};

export default function Button({ variant = "primary", type = "button", children, ...props }) {
  const className = VARIANT_CLASS[variant] ?? VARIANT_CLASS.primary;
  return (
    <button type={type} className={className} {...props}>
      {children}
    </button>
  );
}