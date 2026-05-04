import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <div className="drone-bg-anim absolute inset-0" aria-hidden />

      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="mist-band mist-band--top" />
        <div className="mist-band mist-band--bottom" />
      </div>

      <div
        className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-slate-950/55"
        aria-hidden
      />

      <div className="relative z-10 min-h-screen flex items-end sm:items-center justify-center sm:justify-end p-6 sm:pr-12 lg:pr-24">
        <div className="w-full max-w-lg">
          <div className="mb-6 text-center sm:text-left text-white">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight drop-shadow-lg">
              Join DroneSpace
            </h1>
            <p className="mt-2 text-sm text-white/85 drop-shadow">
              Create an account to share your aerial footage with the world.
            </p>
          </div>
          <div className="flex justify-center">
            <SignUp
              appearance={{
                variables: {
                  colorText: "#0f172a",
                  borderRadius: "1.25rem",
                },
                elements: {
                  rootBox: "w-full",
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
