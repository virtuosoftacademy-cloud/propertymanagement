"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Banknote,
  Building2,
  UserCog,
  UserRound,
  Users,
} from "lucide-react";
import { resolvePlan } from "@/lib/billing/plans";
import type { ManagerAccount, ManagerAccountStatus } from "@/types/billing";

interface ManagerAccountsTableProps {
  accounts: ManagerAccount[];
  onRecordPayment: (account: ManagerAccount) => void;
  onEdit: (account: ManagerAccount) => void;
  /**
   * Description of what is narrowing the list (search term, status, plan), so
   * the empty state can say why it is empty rather than claiming nothing exists.
   */
  filterSummary?: string;
}

const STATUS_META: Record<
  ManagerAccountStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Pending", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  past_due: { label: "Past due", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
  expired: { label: "Expired", variant: "outline" },
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB");
};

const formatAmount = (amount: number) =>
  `£${amount.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

export function ManagerAccountsTable({
  accounts,
  onRecordPayment,
  onEdit,
  filterSummary,
}: ManagerAccountsTableProps) {
  const isFiltered = Boolean(filterSummary?.trim());

  return (
    <Card className="shadow-md dark:shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Manager accounts
        </CardTitle>
        <CardDescription>
          Accounts sold to clients. Payment is taken in cash and recorded here.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {accounts.length === 0 ? (
          <div className="py-16 text-center">
            <UserCog className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
            <h3 className="mb-1 text-lg font-medium">
              {isFiltered ? "No matching accounts" : "No manager accounts yet"}
            </h3>
            <p className="text-muted-foreground">
              {isFiltered
                ? `Nothing matches ${filterSummary!.trim()}. Try widening the filters.`
                : "Accounts you sell to clients will appear here."}
            </p>
          </div>
        ) : (
          // Wide content scrolls inside its own container so the page body never does.
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last paid</TableHead>
                  <TableHead>Renews</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const status = STATUS_META[account.status];
                  const plan = resolvePlan(account.planId);

                  return (
                    <TableRow key={account.id}>
                      <TableCell>
                        {/* Company leads when there is one — it is the entity
                            being billed — with the person underneath. The badge
                            makes the distinction explicit rather than leaving it
                            to be inferred from a missing second line. */}
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {account.companyName || account.clientName}
                          </span>
                          <Badge
                            variant="outline"
                            className="shrink-0 gap-1 px-1.5 py-0 text-[10px] font-normal"
                          >
                            {account.companyName ? (
                              <>
                                <Building2 className="h-3 w-3" />
                                Company
                              </>
                            ) : (
                              <>
                                <UserRound className="h-3 w-3" />
                                Individual
                              </>
                            )}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {account.companyName
                            ? `${account.clientName} · ${account.contactEmail}`
                            : account.contactEmail}
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.managerName ? (
                          <span className="text-sm">{account.managerName}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm italic">
                            Not provisioned
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {plan?.name ?? account.planId}
                        </div>
                        <div className="text-muted-foreground text-xs capitalize">
                          {account.billingCycle}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatAmount(account.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(account.lastPaymentAt)}
                      </TableCell>
                      <TableCell
                        className={`text-sm ${
                          account.status === "past_due"
                            ? "text-destructive font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        {formatDate(account.renewsAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">
                                Actions for {account.clientName}
                              </span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => onRecordPayment(account)}
                            >
                              <Banknote className="mr-2 h-4 w-4" />
                              Record cash payment
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onEdit(account)}>
                              <UserCog className="mr-2 h-4 w-4" />
                              Edit account
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
