class Temp(val deg: Int, val unit: Char)

object Celsius:
  def unapply(t: Temp): Option[Int] = if t.unit == 'C' then Some(t.deg) else None

object Fahrenheit:
  def unapply(t: Temp): Option[Int] = if t.unit == 'F' then Some(t.deg) else None

def toCelsius(t: Temp): Option[Int] =
  Celsius.unapply(t).orElse(Fahrenheit.unapply(t).map(f => (f - 32) * 5 / 9))
