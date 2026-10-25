import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils"

const rawButtonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-4xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-transparent dark:hover:bg-input/30",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// Merged, as Button merges its own: the base's border-transparent and a
// variant's border-border are both in the raw cva output, and without
// tailwind-merge whichever the stylesheet lists last wins — a Link or a
// Dialog trigger styled as an outline button came out borderless.
const buttonVariants = (options) => cn(rawButtonVariants(options));

// How long a submit button ignores another press after the first. Long
// enough to swallow a double click; short enough that a real second
// attempt after an error is never refused.
const SUBMIT_SETTLE_MS = 1200;

// `loading` is for a button whose action is under way: it shows a
// spinner in place of the button's own icon and cannot be pressed again.
//
// MULTIPLE CLICKS. Every button guards itself, so a form does not have to
// remember to:
//   - an onClick that returns a promise (an async save) makes the button
//     busy until it settles, spinner and all, and presses in between do
//     nothing;
//   - a submit button ignores presses for a moment after the first, so a
//     double click sends the form once. (The form's own busy state takes
//     over from there, as before.)
// The check is a ref as well as state, so two clicks in the same frame,
// before React has re-rendered, still count as one.
function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  onClick,
  type,
  ...props
}) {
  const [pending, setPending] = React.useState(false);
  const locked = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);

  const handleClick = (event) => {
    if (locked.current) {
      event.preventDefault();
      return;
    }
    const result = onClick?.(event);
    if (result && typeof result.then === 'function') {
      locked.current = true;
      setPending(true);
      Promise.resolve(result).finally(() => {
        locked.current = false;
        if (mounted.current) setPending(false);
      });
    } else if (type === 'submit' && !event.defaultPrevented) {
      // Locked until the moment passes OR anything in the form changes:
      // a double click changes nothing, but someone fixing what the
      // form just refused must be able to send it again at once.
      locked.current = true;
      const form = event.currentTarget?.form;
      const unlock = () => {
        locked.current = false;
        clearTimeout(timer);
        form?.removeEventListener('input', unlock, true);
        form?.removeEventListener('change', unlock, true);
      };
      const timer = setTimeout(unlock, SUBMIT_SETTLE_MS);
      form?.addEventListener('input', unlock, true);
      form?.addEventListener('change', unlock, true);
    }
    return result;
  };

  const busy = loading || pending;
  return (
    <ButtonPrimitive
      data-slot="button"
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      type={type}
      onClick={handleClick}
      className={buttonVariants({
        variant, size,
        className: cn(busy && "[&>svg:not([data-spinner])]:hidden", className),
      })}
      {...props}>
      {busy ? <Loader2 data-spinner="" aria-hidden="true" className="animate-spin" /> : null}
      {children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants }
