"use client"

import { useState, useEffect } from "react"
import { Coins } from "lucide-react"

interface CreditBalanceProps {
  className?: string
  showIcon?: boolean
  size?: "sm" | "md"
}

export function CreditBalance({
  className,
  showIcon = true,
  size = "md",
}: CreditBalanceProps) {
  const [balance, setBalance] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchBalance()
  }, [])

  const fetchBalance = async () => {
    try {
      const res = await fetch("/api/credits")
      if (res.ok) {
        const data = await res.json()
        setBalance(data.balance)
      }
    } catch (error) {
      console.error("Failed to fetch credit balance:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className={className}>
        <span className="text-muted-foreground">...</span>
      </div>
    )
  }

  if (balance === null) {
    return null
  }

  const textSize = size === "sm" ? "text-sm" : "text-base"

  return (
    <div className={`flex items-center gap-1.5 ${className || ""}`}>
      {showIcon && <Coins className={size === "sm" ? "w-4 h-4" : "w-5 h-5"} />}
      <span className={`font-medium ${textSize}`}>
        {balance.toLocaleString()}C
      </span>
    </div>
  )
}
