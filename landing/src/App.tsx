// LevelUp Life front page: the "Teal Treasury Landing" template (MIT, Kedhareswer Naidu, see ../LICENSE) with its own
// text, sections and animations. Only the brand name and the links into the app are set here; the footer keeps the
// template's line that the company and figures are made up and nothing is an offer of banking products.
import TealTreasuryLanding from "@/components/ui/teal-treasury-landing"

const APP = "app.html" // the LevelUp Life app

export default function Landing() {
  return (
    <TealTreasuryLanding
      brand="LevelUp Life"
      nav={{
        products: [
          { label: "Treasury", text: "Operate every fund account from one live dashboard.", href: "#features" },
          { label: "Vault accounts", text: "Programmatic FDIC coverage across 500 banks.", href: "#coverage" },
          { label: "Credit lines", text: "Capital call lines without the paperwork.", href: "#faq" },
        ],
        links: [
          { label: "Pricing", href: "#pricing" },
          { label: "Resources", href: "#resources" },
        ],
        login: { label: "Sign in", href: APP },
        cta: { label: "Get started", href: APP },
      }}
      hero={{ primary: { label: "Get started", href: APP } }}
      footer={{
        columns: [
          { title: "Get started", links: [{ label: "Sign in", href: APP }, { label: "Sign up", href: APP }] },
          { title: "For startups", links: [{ label: "Overview" }, { label: "Equity" }, { label: "Banking" }, { label: "Payroll" }, { label: "Pricing", href: "#pricing" }] },
          { title: "For investors", links: [{ label: "Rolling funds" }, { label: "Syndicates" }, { label: "Venture funds" }, { label: "LP portal" }] },
          { title: "For fund managers", links: [{ label: "Fund admin" }, { label: "Treasury", href: "#features" }, { label: "Tax" }, { label: "Fund performance" }] },
          { title: "Resources", links: [{ label: "Blog", href: "#resources" }, { label: "Help center" }, { label: "About" }, { label: "Careers" }, { label: "Contact" }] },
        ],
      }}
      // the call to action's email box opens the app; the address is not stored or sent anywhere
      onGetStarted={() => { window.location.href = APP; return true }}
    />
  )
}
