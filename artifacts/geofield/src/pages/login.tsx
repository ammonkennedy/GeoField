import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pickaxe, Compass, Map } from "lucide-react";

export default function Login() {
  const { data, isLoading } = useGetCurrentAuthUser();
  const [, setLocation] = useLocation();

  if (isLoading) return null;

  if (data?.user) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Subtle background */}
      <div 
        className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url('${import.meta.env.BASE_URL}images/topo-bg.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Decorative blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-accent/20 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000" />
      
      <Card className="relative z-10 w-full max-w-md p-8 md:p-10 shadow-2xl border-primary/10 bg-card/80 backdrop-blur-xl m-4">
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-20 h-20 bg-gradient-to-br from-primary to-accent rounded-2xl shadow-inner flex items-center justify-center text-white transform -rotate-6">
            <Pickaxe className="w-10 h-10" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-4xl font-display font-bold text-foreground">GeoField</h1>
            <p className="text-muted-foreground text-lg">Professional geological data collection</p>
          </div>

          <div className="w-full space-y-4 pt-4">
            
            <Button asChild className="w-full h-12 text-lg font-medium shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
              <a href="/api/login">Continue with Replit</a>
            </Button>
            
            <Button asChild variant="outline" className="w-full h-12 text-lg">
            <a href="/">Continue without Login</a>
            </Button>
              
            <p className="text-xs text-muted-foreground">
              Sign in to sync your field data with your lab account.
            </p>
          </div>
          
          <div className="flex items-center gap-6 pt-6 text-muted-foreground/60">
            <Compass className="w-6 h-6" />
            <Map className="w-6 h-6" />
          </div>
        </div>
      </Card>
    </div>
  );
}
