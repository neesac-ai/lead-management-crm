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
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-2xl font-bold tracking-tight">LeadFlow</span>
            </div>
          </div>
          
          <div className="space-y-8">
            <div className="space-y-4 animate-fade-in">
              <h1 className="text-4xl xl:text-5xl font-bold leading-tight">
                Transform your leads into lasting relationships
              </h1>
              <p className="text-lg xl:text-xl text-white/80 max-w-md">
                Streamline your sales pipeline, automate follow-ups, and close more deals with our intelligent CRM platform.
              </p>
            </div>
            
            <div className="grid grid-cols-3 gap-6 animate-fade-in animate-delay-200">
              <div className="space-y-2">
                <div className="text-3xl xl:text-4xl font-bold">10k+</div>
                <div className="text-sm text-white/70">Active Users</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl xl:text-4xl font-bold">50M+</div>
                <div className="text-sm text-white/70">Leads Managed</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl xl:text-4xl font-bold">98%</div>
                <div className="text-sm text-white/70">Satisfaction</div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-white/60 animate-fade-in animate-delay-300">
            <span>Trusted by 500+ companies worldwide</span>
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







