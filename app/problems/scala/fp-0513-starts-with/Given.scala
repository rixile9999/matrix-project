import Stream.{Cons, Empty}

enum Stream[+A]:
  case Empty
  case Cons(h: () => A, t: () => Stream[A])

object Stream:
  def cons[A](hd: => A, tl: => Stream[A]): Stream[A] =
    lazy val head = hd
    lazy val tail = tl
    Cons(() => head, () => tail)

  def empty[A]: Stream[A] = Empty

  def apply[A](as: A*): Stream[A] =
    if as.isEmpty then empty else cons(as.head, apply(as.tail*))

def unfold[A, S](z: S)(f: S => Option[(A, S)]): Stream[A] =
  f(z) match
    case Some((a, s)) => Stream.cons(a, unfold(s)(f))
    case None => Stream.empty

extension [A](s: Stream[A])
  def zipAll[B](s2: Stream[B]): Stream[(Option[A], Option[B])] =
    unfold((s, s2)) {
      case (Empty, Empty) => None
      case (Cons(h, t), Empty) => Some(((Some(h()), None), (t(), Stream.empty)))
      case (Empty, Cons(h, t)) => Some(((None, Some(h())), (Stream.empty, t())))
      case (Cons(h1, t1), Cons(h2, t2)) => Some(((Some(h1()), Some(h2())), (t1(), t2())))
    }

extension [A](s: Stream[A])
  def takeWhile(p: A => Boolean): Stream[A] = s match
    case Cons(h, t) if p(h()) => Stream.cons(h(), t().takeWhile(p))
    case _ => Stream.empty

extension [A](s: Stream[A])
  def forAll(p: A => Boolean): Boolean = s match
    case Cons(h, t) => p(h()) && t().forAll(p)
    case Empty => true

extension [A](s: Stream[A])
  def toList: List[A] =
    @annotation.tailrec
    def go(cur: Stream[A], acc: List[A]): List[A] = cur match
      case Cons(h, t) => go(t(), h() :: acc)
      case Empty => acc.reverse
    go(s, Nil)
