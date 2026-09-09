// ─────────────────────────────────────────────────────────────
// features/donations/components/ProductMatchComboBox.jsx
//
// Searchable product lookup so a line CAN route to 'allocated'
// instead of 'unmatched' at intake.
//
// Wired (Part A): typing here searches live stock via
// GET /api/donations/intake/products/search?name=... (debounced).
// Picking a result sets the line's productId, which routes it through
// the existing server-side auto-classify path (no manager flag);
// leaving it unmatched keeps the existing manual-entry/review path.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { searchProducts } from "../../../services/donationAPI";

export function ProductMatchCombobox({ value, label, onSelect }) {
  // A matched line shows the product's name rather than the raw id.
  const displayLabel = value != null && label ? label : "";

  const [term, setTerm] = useState(displayLabel);
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Sync the visible text when the parent changes/clears the selection
  // (e.g. the "clear match" button on the row). Done during render with a
  // previous-value guard — the React-recommended alternative to a
  // setState-in-effect, which cascades an extra render.
  const [prevDisplayLabel, setPrevDisplayLabel] = useState(displayLabel);
  if (displayLabel !== prevDisplayLabel) {
    setPrevDisplayLabel(displayLabel);
    setTerm(displayLabel);
  }

  // Debounced live search. A hit routes via auto-classify; no results
  // simply leaves the staff member on the manual-entry fields below.
  useEffect(() => {
    if (value != null && term === displayLabel) return; // not searching
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = term.trim();
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      setSearchError(null);
      setIsOpen(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const rows = await searchProducts(trimmed);
        setResults(rows);
        setSearchError(null);
        setIsOpen(true);
      } catch (error) {
        setSearchError(error.message || "Search failed.");
        setResults([]);
        setIsOpen(false);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [term, value, displayLabel]);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  const pick = (product) => {
    onSelect(product.id, product.name);
    setTerm(product.name);
    setIsOpen(false);
    setResults([]);
  };

  const clear = () => {
    onSelect(null, "");
    setTerm("");
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        type="text"
        className="stf-select"
        placeholder="Search stock items..."
        value={term}
        aria-label="Search stock items"
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true);
        }}
      />
      {value != null ? (
        <button
          type="button"
          onClick={clear}
          style={{ marginLeft: 8, fontSize: 12, textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
        >
          Clear match
        </button>
      ) : null}
      {isSearching ? (
        <div style={{ fontSize: 12, color: "#676767", padding: "4px 0" }}>Searching…</div>
      ) : null}
      {searchError ? (
        <div style={{ fontSize: 12, color: "#ef3a40", padding: "4px 0" }}>{searchError}</div>
      ) : null}
      {isOpen && results.length > 0 ? (
        <ul
          style={{
            position: "absolute",
            zIndex: 30,
            top: "100%",
            left: 0,
            right: 0,
            margin: 0,
            padding: "4px 0",
            listStyle: "none",
            background: "#fff",
            border: "1px solid #e9e3dd",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => pick(product)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                <span style={{ fontWeight: 600 }}>{product.name}</span>
                {product.sku ? <span style={{ color: "#676767" }}> · {product.sku}</span> : null}
                {product.weight_kg != null ? <span style={{ color: "#676767" }}> · {product.weight_kg} kg</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}