case class Account(owner: String, balance: Int, active: Boolean)

def deposit(a: Account, amount: Int): Account =
  a.copy(balance = a.balance + amount)
