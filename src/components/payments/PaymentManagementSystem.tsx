"use client";

import React, { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils/formatting";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CreditCard,
  Banknote,
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  Plus,
  Edit,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  PaymentStatus,
  PaymentMethod,
  PaymentType,
  IPayment,
  ILease,
} from "@/types";
import { LeaseResponse } from "@/lib/services/lease.service";
import { toast } from "sonner";

interface PaymentManagementSystemProps {
  leaseId: string;
  lease: LeaseResponse;
  onPaymentUpdate?: () => void;
}

interface PaymentFormData {
  amount: number;
  type: PaymentType;
  paymentMethod: PaymentMethod;
  dueDate: string;
  description: string;
  notes: string;
}

export function PaymentManagementSystem({
  leaseId,
  lease,
  onPaymentUpdate,
}: PaymentManagementSystemProps) {
  const [payments, setPayments] = useState<IPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "ALL">(
    "ALL"
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<IPayment | null>(null);
  const [formData, setFormData] = useState<PaymentFormData>({
    amount: lease.terms?.rentAmount || 0,
    type: PaymentType.RENT,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    dueDate: new Date().toISOString().split("T")[0],
    description: "Monthly rent payment",
    notes: "",
  });
  const [processData, setProcessData] = useState({
    amount: 0,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    transactionId: "",
    notes: "",
  });

  useEffect(() => {
    fetchPayments();
  }, [leaseId]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/payments?leaseId=${leaseId}`);
      const data = await response.json();

      if (data.success) {
        setPayments(data?.data || []);
      }
    } catch (error) {
      console.error("Error fetching payments:", error);
      toast.error("Failed to load payments");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePayment = async () => {
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId: lease.tenantId._id || lease.tenantId,
          propertyId: lease.propertyId._id || lease.propertyId,
          leaseId: leaseId,
          amount: formData.amount,
          type: formData.type,
          dueDate: new Date(formData.dueDate).toISOString(),
          description: formData.description,
          notes: formData.notes,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Payment created successfully");
        setShowCreateDialog(false);
        fetchPayments();
        onPaymentUpdate?.();

        // Reset form
        setFormData({
          amount: lease.terms?.rentAmount || 0,
          type: PaymentType.RENT,
          paymentMethod: PaymentMethod.CREDIT_CARD,
          dueDate: new Date().toISOString().split("T")[0],
          description: "Monthly rent payment",
          notes: "",
        });
      } else {
        toast.error(data.message || "Failed to create payment");
      }
    } catch (error) {
      console.error("Error creating payment:", error);
      toast.error("Failed to create payment");
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedPayment) return;

    try {
      const response = await fetch(
        `/api/tenant/payments/${selectedPayment._id}/pay`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: processData.amount,
            paymentMethod: processData.paymentMethod,
            transactionId: processData.transactionId,
            notes: processData.notes,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        toast.success("Payment processed successfully");
        setShowProcessDialog(false);
        setSelectedPayment(null);
        fetchPayments();
        onPaymentUpdate?.();

        // Reset process data
        setProcessData({
          amount: 0,
          paymentMethod: PaymentMethod.CREDIT_CARD,
          transactionId: "",
          notes: "",
        });
      } else {
        toast.error(data.message || "Failed to process payment");
      }
    } catch {
      toast.error("Failed to process payment");
    }
  };

  const openProcessDialog = (payment: IPayment) => {
    setSelectedPayment(payment);
    setProcessData({
      amount: payment.amount - (payment.amountPaid || 0),
      paymentMethod: PaymentMethod.CREDIT_CARD,
      transactionId: "",
      notes: "",
    });
    setShowProcessDialog(true);
  };

  // const formatCurrency = (amount: number) => {
  //   return new Intl.NumberFormat("en-US", {
  //     style: "currency",
  //     currency: "USD",
  //   }).format(amount);
  // };

  const getStatusColor = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.COMPLETED:
        return "bg-green-100 dark:bg-green-900/25 text-green-800 dark:text-green-200";
      case PaymentStatus.PENDING:
        return "bg-yellow-100 dark:bg-yellow-900/25 text-yellow-800 dark:text-yellow-200";
      case PaymentStatus.OVERDUE:
        return "bg-red-100 dark:bg-red-900/25 text-red-800 dark:text-red-200";
      case PaymentStatus.PROCESSING:
        return "bg-blue-100 dark:bg-blue-900/25 text-blue-800 dark:text-blue-200";
      case PaymentStatus.PARTIAL:
        return "bg-orange-100 dark:bg-orange-900/25 text-orange-800 dark:text-orange-200";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const filteredPayments = payments.filter((payment) => {
    const matchesSearch =
      payment.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL" || payment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Payment Management
              </CardTitle>
              <CardDescription>
                Manage payments and process transactions for this lease
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchPayments}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Dialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
              >
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Payment
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Payment</DialogTitle>
                    <DialogDescription>
                      Create a new payment record for this lease
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="amount">Amount</Label>
                        <Input
                          id="amount"
                          type="number"
                          step="0.01"
                          value={formData.amount}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              amount: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="type">Payment Type</Label>
                        <Select
                          value={formData.type}
                          onValueChange={(value: PaymentType) =>
                            setFormData({ ...formData, type: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={PaymentType.RENT}>
                              Rent
                            </SelectItem>
                            <SelectItem value={PaymentType.SECURITY_DEPOSIT}>
                              Security Deposit
                            </SelectItem>
                            <SelectItem value={PaymentType.INVOICE}>
                              Invoice
                            </SelectItem>
                            <SelectItem value={PaymentType.PET_DEPOSIT}>
                              Pet Deposit
                            </SelectItem>
                            <SelectItem value={PaymentType.LATE_FEE}>
                              Late Fee
                            </SelectItem>
                            <SelectItem value={PaymentType.MAINTENANCE}>
                              Maintenance
                            </SelectItem>
                            <SelectItem value={PaymentType.UTILITY}>
                              Utility
                            </SelectItem>
                            <SelectItem value={PaymentType.OTHER}>
                              Other
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="dueDate">Due Date</Label>
                      <Input
                        id="dueDate"
                        type="date"
                        value={formData.dueDate}
                        onChange={(e) =>
                          setFormData({ ...formData, dueDate: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Input
                        id="description"
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            description: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="notes">Notes (Optional)</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData({ ...formData, notes: e.target.value })
                        }
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowCreateDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleCreatePayment}>
                      Create Payment
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search payments..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value: PaymentStatus | "ALL") =>
                setStatusFilter(value)
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value={PaymentStatus.PENDING}>Pending</SelectItem>
                <SelectItem value={PaymentStatus.COMPLETED}>
                  Completed
                </SelectItem>
                <SelectItem value={PaymentStatus.OVERDUE}>Overdue</SelectItem>
                <SelectItem value={PaymentStatus.PROCESSING}>
                  Processing
                </SelectItem>
                <SelectItem value={PaymentStatus.PARTIAL}>Partial</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Payments List */}
      <Card>
        <CardHeader>
          <CardTitle>Payments ({filteredPayments.length})</CardTitle>
          <CardDescription>All payment records for this lease</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredPayments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No payments found</p>
              <Button
                className="mt-4"
                onClick={() => setShowCreateDialog(true)}
              >
                Create First Payment
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPayments.map((payment) => (
                <div
                  key={payment._id.toString()}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-muted rounded-lg">
                      {payment.paymentMethod === PaymentMethod.CREDIT_CARD ? (
                        <CreditCard className="h-5 w-5" />
                      ) : (
                        <Banknote className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{payment.type}</p>
                        <Badge className={getStatusColor(payment.status)}>
                          {payment.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {payment.description}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Due: {new Date(payment.dueDate).toLocaleDateString()}
                        </span>
                        {payment.paidDate && (
                          <span className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Paid:{" "}
                            {new Date(payment.paidDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-lg">
                      {formatCurrency(payment.amount)}
                    </p>
                    {payment.amountPaid && payment.amountPaid > 0 && (
                      <p className="text-sm text-green-600 dark:text-green-400">
                        Paid: {formatCurrency(payment.amountPaid)}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {payment.status !== PaymentStatus.COMPLETED && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openProcessDialog(payment)}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Process
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Process Payment Dialog */}
      <Dialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>
              Record a payment for {selectedPayment?.type} -{" "}
              {formatCurrency(selectedPayment?.amount || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="processAmount">Payment Amount</Label>
                <Input
                  id="processAmount"
                  type="number"
                  step="0.01"
                  value={processData.amount}
                  onChange={(e) =>
                    setProcessData({
                      ...processData,
                      amount: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="processMethod">Payment Method</Label>
                <Select
                  value={processData.paymentMethod}
                  onValueChange={(value: PaymentMethod) =>
                    setProcessData({ ...processData, paymentMethod: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PaymentMethod.CREDIT_CARD}>
                      Credit Card
                    </SelectItem>
                    <SelectItem value={PaymentMethod.DEBIT_CARD}>
                      Debit Card
                    </SelectItem>
                    <SelectItem value={PaymentMethod.BANK_TRANSFER}>
                      Bank Transfer
                    </SelectItem>
                    <SelectItem value={PaymentMethod.CASH}>Cash</SelectItem>
                    <SelectItem value={PaymentMethod.CHECK}>Check</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="transactionId">Transaction ID (Optional)</Label>
              <Input
                id="transactionId"
                value={processData.transactionId}
                onChange={(e) =>
                  setProcessData({
                    ...processData,
                    transactionId: e.target.value,
                  })
                }
                placeholder="Enter transaction reference"
              />
            </div>
            <div>
              <Label htmlFor="processNotes">Notes (Optional)</Label>
              <Textarea
                id="processNotes"
                value={processData.notes}
                onChange={(e) =>
                  setProcessData({ ...processData, notes: e.target.value })
                }
                rows={3}
                placeholder="Add any notes about this payment"
              />
            </div>
            {selectedPayment &&
              processData.amount <
                selectedPayment.amount - (selectedPayment.amountPaid || 0) && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This will be recorded as a partial payment. Remaining
                    balance:{" "}
                    {formatCurrency(
                      selectedPayment.amount -
                        (selectedPayment.amountPaid || 0) -
                        processData.amount
                    )}
                  </AlertDescription>
                </Alert>
              )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowProcessDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleProcessPayment}>Process Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
