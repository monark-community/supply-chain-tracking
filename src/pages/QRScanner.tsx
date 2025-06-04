
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { QrCode, ArrowLeft, CheckCircle, Package, MapPin, Calendar } from "lucide-react";

const QRScanner = () => {
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);

  const mockProduct = {
    id: "ORG-001",
    name: "Organic Coffee Beans",
    description: "Premium organic coffee beans from Colombian highlands",
    currentStatus: "Delivered",
    currentLocation: "Green Market Store, New York",
    qrCode: "https://chainproof.com/verify/ORG-001",
    journey: [
      {
        stage: "Production",
        stakeholder: "Green Farm Co.",
        location: "Colombian Highlands",
        timestamp: "2024-05-15 08:00:00",
        status: "Completed",
        details: "Organic coffee beans harvested and processed"
      },
      {
        stage: "Quality Check",
        stakeholder: "CertiFresh Labs",
        location: "Bogotá, Colombia",
        timestamp: "2024-05-16 14:30:00",
        status: "Completed",
        details: "Quality certification and organic verification completed"
      },
      {
        stage: "Shipping",
        stakeholder: "Global Logistics Inc.",
        location: "Port of Cartagena",
        timestamp: "2024-05-18 09:15:00",
        status: "Completed",
        details: "Shipped via container vessel MS Explorer"
      },
      {
        stage: "Import Processing",
        stakeholder: "US Customs & Border",
        location: "Port of Miami, FL",
        timestamp: "2024-05-25 16:45:00",
        status: "Completed",
        details: "Customs clearance and import documentation processed"
      },
      {
        stage: "Distribution",
        stakeholder: "FreshDist Networks",
        location: "Atlanta, GA Distribution Center",
        timestamp: "2024-05-27 11:20:00",
        status: "Completed",
        details: "Stored and prepared for regional distribution"
      },
      {
        stage: "Final Delivery",
        stakeholder: "Green Market Store",
        location: "New York, NY",
        timestamp: "2024-05-30 09:30:00",
        status: "Completed",
        details: "Product delivered and shelved for retail sale"
      }
    ]
  };

  const handleScan = () => {
    setIsScanning(true);
    // Simulate scanning delay
    setTimeout(() => {
      setScannedProduct(mockProduct);
      setIsScanning(false);
    }, 2000);
  };

  const getStatusColor = (status: string) => {
    return status === "Completed" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Link>
            </Button>
            <div className="flex items-center space-x-2">
              <QrCode className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">QR Scanner</span>
            </div>
          </div>
          <Button asChild>
            <Link to="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {!scannedProduct ? (
          <div className="max-w-md mx-auto">
            <Card>
              <CardHeader className="text-center">
                <CardTitle>Scan Product QR Code</CardTitle>
                <CardDescription>
                  Point your camera at a QR code to view the product's journey
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-6">
                <div className="relative">
                  <div className="w-64 h-64 mx-auto bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                    {isScanning ? (
                      <div className="animate-pulse">
                        <QrCode className="h-16 w-16 text-blue-600" />
                        <p className="mt-2 text-sm text-gray-600">Scanning...</p>
                      </div>
                    ) : (
                      <div>
                        <QrCode className="h-16 w-16 text-gray-400 mx-auto" />
                        <p className="mt-2 text-sm text-gray-600">Camera View</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <Button 
                  onClick={handleScan} 
                  disabled={isScanning}
                  className="w-full"
                >
                  {isScanning ? "Scanning..." : "Start Scanning"}
                </Button>
                
                <div className="text-xs text-gray-500">
                  <p>Demo Mode: Click "Start Scanning" to see a sample product journey</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Product Header */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">{scannedProduct.name}</CardTitle>
                    <CardDescription className="mt-2">{scannedProduct.description}</CardDescription>
                    <div className="flex items-center space-x-2 mt-4">
                      <Badge variant="secondary">{scannedProduct.id}</Badge>
                      <Badge className={getStatusColor(scannedProduct.currentStatus)}>
                        {scannedProduct.currentStatus}
                      </Badge>
                    </div>
                  </div>
                  <Button variant="outline" onClick={() => setScannedProduct(null)}>
                    Scan Another
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2 text-gray-600">
                  <MapPin className="h-4 w-4" />
                  <span>Current Location: {scannedProduct.currentLocation}</span>
                </div>
              </CardContent>
            </Card>

            {/* Product Journey */}
            <Card>
              <CardHeader>
                <CardTitle>Product Journey</CardTitle>
                <CardDescription>
                  Complete traceability from origin to current location
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {scannedProduct.journey.map((step, index) => (
                    <div key={index} className="relative">
                      {index < scannedProduct.journey.length - 1 && (
                        <div className="absolute left-6 top-12 h-16 w-0.5 bg-gray-300"></div>
                      )}
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0">
                          <CheckCircle className="h-12 w-12 text-green-600 bg-white rounded-full" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">{step.stage}</h3>
                            <Badge className={getStatusColor(step.status)}>
                              {step.status}
                            </Badge>
                          </div>
                          <p className="text-gray-600 font-medium">{step.stakeholder}</p>
                          <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                            <div className="flex items-center space-x-1">
                              <MapPin className="h-4 w-4" />
                              <span>{step.location}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-4 w-4" />
                              <span>{new Date(step.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                          <p className="text-gray-700 mt-2">{step.details}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Verification */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <span>Verification Status</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-green-600">✓ Authentic Product</h4>
                    <p className="text-sm text-gray-600">Verified on blockchain</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-600">✓ Complete Journey</h4>
                    <p className="text-sm text-gray-600">All checkpoints recorded</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-600">✓ Quality Assured</h4>
                    <p className="text-sm text-gray-600">Passed all quality checks</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-600">✓ Tamper-proof</h4>
                    <p className="text-sm text-gray-600">Immutable blockchain record</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default QRScanner;
