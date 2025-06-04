
import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Calendar, CheckCircle, Package, Truck, Factory, Users } from "lucide-react";

const ProductJourney = () => {
  const [searchParams] = useSearchParams();
  const productId = searchParams.get('id') || 'ORG-001';
  
  const mockProduct = {
    id: productId,
    name: "Organic Coffee Beans",
    description: "Premium organic coffee beans from Colombian highlands",
    category: "Food & Beverage",
    batch: "CB-2024-05-001",
    currentStatus: "Delivered",
    currentLocation: "Green Market Store, New York",
    journey: [
      {
        stage: "Production",
        stakeholder: "Green Farm Co.",
        location: "Colombian Highlands",
        timestamp: "2024-05-15 08:00:00",
        status: "Completed",
        details: "Organic coffee beans harvested and processed using sustainable farming methods",
        icon: Factory,
        txHash: "0x1a2b3c...789",
        coordinates: { lat: 4.7110, lng: -74.0721 }
      },
      {
        stage: "Quality Check",
        stakeholder: "CertiFresh Labs",
        location: "Bogotá, Colombia",
        timestamp: "2024-05-16 14:30:00",
        status: "Completed",
        details: "Quality certification and organic verification completed. All tests passed.",
        icon: CheckCircle,
        txHash: "0x2b3c4d...890",
        coordinates: { lat: 4.7110, lng: -74.0721 }
      },
      {
        stage: "Shipping",
        stakeholder: "Global Logistics Inc.",
        location: "Port of Cartagena",
        timestamp: "2024-05-18 09:15:00",
        status: "Completed",
        details: "Shipped via container vessel MS Explorer. Temperature-controlled storage maintained.",
        icon: Truck,
        txHash: "0x3c4d5e...901",
        coordinates: { lat: 10.3910, lng: -75.4794 }
      },
      {
        stage: "Import Processing",
        stakeholder: "US Customs & Border",
        location: "Port of Miami, FL",
        timestamp: "2024-05-25 16:45:00",
        status: "Completed",
        details: "Customs clearance and import documentation processed. All regulations met.",
        icon: CheckCircle,
        txHash: "0x4d5e6f...012",
        coordinates: { lat: 25.7617, lng: -80.1918 }
      },
      {
        stage: "Distribution",
        stakeholder: "FreshDist Networks",
        location: "Atlanta, GA Distribution Center",
        timestamp: "2024-05-27 11:20:00",
        status: "Completed",
        details: "Stored in climate-controlled warehouse and prepared for regional distribution.",
        icon: Package,
        txHash: "0x5e6f7g...123",
        coordinates: { lat: 33.7490, lng: -84.3880 }
      },
      {
        stage: "Final Delivery",
        stakeholder: "Green Market Store",
        location: "New York, NY",
        timestamp: "2024-05-30 09:30:00",
        status: "Completed",
        details: "Product delivered and shelved for retail sale. Ready for consumer purchase.",
        icon: Users,
        txHash: "0x6f7g8h...234",
        coordinates: { lat: 40.7128, lng: -74.0060 }
      }
    ]
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
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
            <div className="flex items-center space-x-2">
              <Package className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">Product Journey</span>
            </div>
          </div>
          <Button asChild>
            <Link to="/scan">QR Scanner</Link>
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Product Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-3xl">{mockProduct.name}</CardTitle>
                  <CardDescription className="mt-2 text-lg">{mockProduct.description}</CardDescription>
                  <div className="flex items-center space-x-3 mt-4">
                    <Badge variant="secondary" className="text-sm">{mockProduct.id}</Badge>
                    <Badge variant="outline" className="text-sm">{mockProduct.category}</Badge>
                    <Badge variant="outline" className="text-sm">Batch: {mockProduct.batch}</Badge>
                    <Badge className={getStatusColor(mockProduct.currentStatus)}>
                      {mockProduct.currentStatus}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2 text-gray-600">
                <MapPin className="h-5 w-5" />
                <span className="text-lg">Current Location: {mockProduct.currentLocation}</span>
              </div>
            </CardContent>
          </Card>

          {/* Journey Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Supply Chain Journey</CardTitle>
              <CardDescription>
                Complete traceability with blockchain verification at each checkpoint
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                {mockProduct.journey.map((step, index) => {
                  const IconComponent = step.icon;
                  return (
                    <div key={index} className="relative">
                      {index < mockProduct.journey.length - 1 && (
                        <div className="absolute left-8 top-16 h-20 w-0.5 bg-gradient-to-b from-blue-300 to-purple-300"></div>
                      )}
                      <div className="flex items-start space-x-6">
                        <div className="flex-shrink-0">
                          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                            <IconComponent className="h-8 w-8 text-white" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="text-xl font-semibold text-gray-900">{step.stage}</h3>
                              <Badge className={getStatusColor(step.status)}>
                                {step.status}
                              </Badge>
                            </div>
                            <p className="text-blue-600 font-medium text-lg mb-3">{step.stakeholder}</p>
                            
                            <div className="grid md:grid-cols-2 gap-4 mb-4">
                              <div className="flex items-center space-x-2 text-gray-600">
                                <MapPin className="h-4 w-4" />
                                <span>{step.location}</span>
                              </div>
                              <div className="flex items-center space-x-2 text-gray-600">
                                <Calendar className="h-4 w-4" />
                                <span>{new Date(step.timestamp).toLocaleString()}</span>
                              </div>
                            </div>
                            
                            <p className="text-gray-700 mb-4">{step.details}</p>
                            
                            <div className="bg-gray-50 p-3 rounded border">
                              <p className="text-sm text-gray-600">
                                <span className="font-semibold">Blockchain Transaction:</span>{" "}
                                <code className="bg-gray-200 px-2 py-1 rounded text-xs">{step.txHash}</code>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Verification Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <span>Blockchain Verification Summary</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">100%</div>
                  <p className="text-sm text-gray-600">Authenticity Verified</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{mockProduct.journey.length}</div>
                  <p className="text-sm text-gray-600">Checkpoints Recorded</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">15 days</div>
                  <p className="text-sm text-gray-600">Total Journey Time</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">6</div>
                  <p className="text-sm text-gray-600">Stakeholders Involved</p>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-800">Verification Complete</span>
                </div>
                <p className="text-green-700 mt-1">
                  This product has been successfully verified through the complete supply chain with 
                  immutable blockchain records at every checkpoint.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ProductJourney;
