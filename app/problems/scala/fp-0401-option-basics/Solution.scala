extension [A](o: Option[A])
  def map[B](f: A => B): Option[B] = o match
    case Some(a) => Some(f(a))
    case None => None
  def flatMap[B](f: A => Option[B]): Option[B] =
    o.map(f).getOrElse(None)
  def getOrElse[B >: A](default: => B): B = o match
    case Some(a) => a
    case None => default
  def orElse[B >: A](ob: => Option[B]): Option[B] =
    o.map(Some(_)).getOrElse(ob)
  def filter(f: A => Boolean): Option[A] =
    o.flatMap(a => if f(a) then Some(a) else None)
