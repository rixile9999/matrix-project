case class ScriptRNG(vs: Vector[Int], i: Int = 0) extends RNG:
  def nextInt: (Int, RNG) = (vs(i % vs.size), ScriptRNG(vs, i + 1))

def scriptRng(vs: Int*): ScriptRNG = ScriptRNG(vs.toVector)

def seeds: scala.List[SimpleRNG] = (1L to 300L).toList.map(s => SimpleRNG(s * 1000003L * 1000003L))

@main def tests(): Unit =
  val v = Vector(Int.MinValue)
  Judge.check("Int.MinValue 는 Int.MaxValue 가 된다")(nonNegativeInt(ScriptRNG(v)), (Int.MaxValue, ScriptRNG(v, 1)))
  Judge.check("-1 은 0 이 된다")(nonNegativeInt(scriptRng(-1)), (0, ScriptRNG(Vector(-1), 1)))
  Judge.check("음수는 -(i+1)")(nonNegativeInt(scriptRng(-5))._1, 4)
  Judge.check("양수는 그대로")(nonNegativeInt(scriptRng(7))._1, 7)
  Judge.check("0 과 Int.MaxValue 는 그대로")((nonNegativeInt(scriptRng(0))._1, nonNegativeInt(scriptRng(Int.MaxValue))._1), (0, Int.MaxValue))
  Judge.check("SimpleRNG 에서 항상 0 이상")(seeds.forall(r => nonNegativeInt(r)._1 >= 0), true)
  Judge.check("돌려주는 RNG 는 한 번 전진한 RNG")(nonNegativeInt(SimpleRNG(42))._2, SimpleRNG(42).nextInt._2)
