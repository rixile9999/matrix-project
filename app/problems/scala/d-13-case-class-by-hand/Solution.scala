class Money(val amount: Int, val cur: String):
  def copy(amount: Int = this.amount, cur: String = this.cur): Money = new Money(amount, cur)
  override def equals(other: Any): Boolean = other match
    case m: Money => amount == m.amount && cur == m.cur
    case _ => false
  override def hashCode: Int = (amount, cur).hashCode
  override def toString: String = s"Money($amount,$cur)"

object Money:
  def unapply(m: Money): Some[(Int, String)] = Some((m.amount, m.cur))
