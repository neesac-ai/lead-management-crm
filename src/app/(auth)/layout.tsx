export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen gradient-mesh flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary to-primary/80" />
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)" />
          </svg>
        </div>
        
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white">
          <div>
            <div className="flex flex-col gap-2 mb-4">
              <span className="text-3xl font-bold tracking-tight">BharatCRM</span>
              <span className="text-sm text-white/70">A product of neesac.ai</span>
            </div>
          </div>
          
          <div className="space-y-8">
            <div className="space-y-4 animate-fade-in">
              <h1 className="text-4xl xl:text-5xl font-bold leading-tight">
                Digitising MSMEs of Bharat
              </h1>
              <p className="text-lg xl:text-xl text-white/80 max-w-md">
                Empowering small businesses with smart CRM solutions. Manage leads, track follow-ups, and grow your business the Bharat way.
              </p>
            </div>
          </div>
          
          <div className="animate-fade-in animate-delay-300">
            <div className="bg-white rounded-lg px-4 py-2 inline-block shadow-lg">
              <span className="text-xl font-semibold tracking-tight">
                <span className="text-slate-800">neesac</span>
                <span className="text-indigo-600">.ai</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}









