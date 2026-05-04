import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      {/* Layer 1: drone-over-misty-forest photo, slow pan/zoom */}
      <div className="drone-bg-anim absolute inset-0" aria-hidden />

      {/* Layer 2: drifting mist bands to enhance the foggy feel */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="mist-band mist-band--top" />
        <div className="mist-band mist-band--bottom" />
      </div>

      {/* Layer 3: subtle dark gradient overlay for legibility */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-slate-950/55"
        aria-hidden
      />

      {/* Layer 4: sign-in card pinned to the right side of the page */}
      <div className="relative z-10 min-h-screen flex items-end sm:items-center justify-center sm:justify-end p-6 sm:pr-12 lg:pr-24">
        <div className="w-full max-w-lg">
          <div className="mb-6 text-center sm:text-left text-white">
            <div className="inline-flex items-center justify-center gap-2 mb-2">
              <span className="text-2xl font-semibold tracking-tight drop-shadow-lg">
                DroneSpace
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight drop-shadow-lg">
              Aerial footage, mapped to the world
            </h1>
            <p className="mt-2 text-sm text-white/85 drop-shadow">
              Sign in to upload, discover and rate drone videos by GPS location.
            </p>
          </div>

          <div className="flex justify-center">
            <SignIn
              appearance={{
                variables: {
                  colorText: "#0f172a",
                  borderRadius: "1.25rem",
                },
                elements: {
                  rootBox: "w-full",
                  // !important forces our transparency past Clerk's own bg styles.
                  // !w-full + !max-w-none lets the card grow with its parent.
                  cardBox:
                    "!w-full !max-w-none !bg-white/20 !backdrop-blur-md !backdrop-saturate-150 !shadow-2xl !rounded-3xl !border !border-white/40 !ring-1 !ring-white/20",
                  card: "!bg-transparent !shadow-none !border-0",
                  headerTitle: "text-slate-900",
                  headerSubtitle: "text-slate-800",
                  socialButtonsBlockButton:
                    "!bg-slate-900/55 hover:!bg-slate-900/75 !border !border-white/25 !text-white",
                  socialButtonsBlockButtonText: "!text-white",
                  formFieldInput:
                    "!bg-white/45 focus:!bg-white/70 !border !border-white/50 placeholder:!text-slate-600",
                  formFieldLabel: "!text-slate-900",
                  dividerLine: "!bg-white/40",
                  dividerText: "!text-slate-800",
                  footer: "!bg-transparent",
                  footerActionText: "!text-slate-800",
                  footerActionLink: "!text-blue-700 hover:!text-blue-900",
                },
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
