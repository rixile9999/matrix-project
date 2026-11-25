class Account(val owner: String, val balance: Int, val frozen: Boolean):
  def copy(owner: String = this.owner, balance: Int = this.balance, frozen: Boolean = this.frozen): Account =
    new Account(owner, balance, frozen)

enum Event:
  case Deposit(n: Int)
  case Withdraw(n: Int)
  case Freeze

def applyEvent(acc: Account, e: Event): Account = e match
  case Event.Freeze => acc.copy(frozen = true)
  case _ if acc.frozen => acc
  case Event.Deposit(n) => acc.copy(balance = acc.balance + n)
  case Event.Withdraw(n) if n <= acc.balance => acc.copy(balance = acc.balance - n)
  case Event.Withdraw(_) => acc

def applyAll(acc: Account, events: List[Event]): Account =
  events.foldLeft(acc)(applyEvent)
