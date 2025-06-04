
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, QrCode, Eye, Users, Truck, Factory } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Shield className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900">ChainProof</span>
          </div>
          <nav className="hidden md:flex space-x-6">
            <Link to="/dashboard" className="text-gray-600 hover:text-blue-600 transition-colors">Dashboard</Link>
            <Link to="/scan" className="text-gray-600 hover:text-blue-600 transition-colors">QR Scanner</Link>
            <Link to="/journey" className="text-gray-600 hover:text-blue-600 transition-colors">Product Journey</Link>
          </nav>
          <Button asChild>
            <Link to="/dashboard">Get Started</Link>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Decentralized Supply Chain
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              Traceability
            </span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            ChainProof enables immutable, transparent tracking of goods throughout the entire supply chain. 
            Every action is recorded on blockchain, ensuring authenticity and preventing counterfeiting.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link to="/dashboard">Start Tracking</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/scan">Scan QR Code</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Why Choose ChainProof?
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="text-center">
              <CardHeader>
                <Shield className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                <CardTitle>Immutable Records</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Every transaction is recorded on blockchain, creating an unchangeable audit trail 
                  that ensures complete transparency and prevents fraud.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <QrCode className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                <CardTitle>QR Code Integration</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Customers can scan QR codes to instantly view a product's complete journey 
                  from origin to store shelf.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <Eye className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                <CardTitle>Real-time Tracking</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Monitor products in real-time as they move through the supply chain with 
                  smart contract validation at every checkpoint.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stakeholders Section */}
      <section className="py-16 px-4 bg-gradient-to-r from-gray-50 to-blue-50">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Built for Every Stakeholder
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <Factory className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Producers</h3>
              <p className="text-gray-600">Record origin and production details</p>
            </div>
            <div className="text-center">
              <Truck className="h-16 w-16 text-orange-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Transporters</h3>
              <p className="text-gray-600">Log shipping and handling information</p>
            </div>
            <div className="text-center">
              <Users className="h-16 w-16 text-purple-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Distributors</h3>
              <p className="text-gray-600">Track inventory and distribution</p>
            </div>
            <div className="text-center">
              <Shield className="h-16 w-16 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Retailers</h3>
              <p className="text-gray-600">Verify authenticity and quality</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Shield className="h-8 w-8 text-blue-400" />
            <span className="text-2xl font-bold">ChainProof</span>
          </div>
          <p className="text-gray-400 mb-6">
            Securing supply chains with blockchain technology
          </p>
          <div className="flex justify-center space-x-6">
            <Link to="/dashboard" className="text-gray-400 hover:text-white transition-colors">Dashboard</Link>
            <Link to="/scan" className="text-gray-400 hover:text-white transition-colors">QR Scanner</Link>
            <Link to="/journey" className="text-gray-400 hover:text-white transition-colors">Product Journey</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
