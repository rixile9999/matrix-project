// 1단계: 값 타입 (case class가 만들어 주던 것)
class Money(val cents: Int):
  override def equals(o: Any): Boolean = o match
    case m: Money => cents == m.cents
    case _        => false
  override def hashCode: Int = cents.hashCode
  override def toString: String = s"Money($cents)"
  // 2단계: 연산자
  def +(o: Money): Money = Money(cents + o.cents)
  def *(n: Int): Money = Money(cents * n)
  def unary_- : Money = Money(-cents)

object Money:
  // 3단계: 패턴 매칭
  def unapply(m: Money): Option[Int] = Some(m.cents)

class Line(val name: String, val qty: Int, val unit: Money)

object Line:
  def unapply(l: Line): Option[(String, Int, Money)] = Some((l.name, l.qty, l.unit))

class Cart(val lines: List[Line]):
  // 2단계: 오른쪽 결합 연산자
  def ::(l: Line): Cart = Cart(l :: lines)

object Cart:
  val empty: Cart = Cart(Nil)

// 4단계: for 컴프리헨션
class Picks[A](val items: List[A]):
  def map[B](f: A => B): Picks[B] = Picks(items.map(f))
  def flatMap[B](f: A => Picks[B]): Picks[B] = Picks(items.flatMap(a => f(a).items))
  def withFilter(p: A => Boolean): Picks[A] = Picks(items.filter(p))
  def foreach(f: A => Unit): Unit = items.foreach(f)

// 5단계: 함수 객체
class Discount(val pct: Int) extends (Money => Money):
  def apply(m: Money): Money = Money(m.cents * (100 - pct) / 100)

// 6단계: using
class TaxRate(val pct: Int)

def withTax(m: Money)(using rate: TaxRate): Money =
  Money(m.cents + m.cents * rate.pct / 100)

def total(cart: Cart, off: Money => Money)(using rate: TaxRate): Money =
  var sum = Money(0)
  for case Line(_, q, unit) <- cart.lines do sum += unit * q
  withTax(off(sum))
